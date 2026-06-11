// src/App.tsx
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  File as FileIcon, X, Download, Check, Pin, FolderOpen, Lightbulb,
  Sun, RotateCcw, Settings, Image as ImageIcon, Type, Film, LayoutGrid,
  Compass, HardDrive, Monitor, BookOpen, Sparkles, Play,
  CheckSquare, Trash2, Smartphone, Edit3, Send, Search, Power,
  ChevronDown, ChevronLeft, ChevronRight, Palette, Keyboard, Plus, FolderPlus, Move, Link,
  StickyNote, CalendarDays, Clock, Tag, Maximize2, Minimize2, Copy, Clipboard, Unplug, Upload
} from 'lucide-react';
import QRCode from 'react-qr-code';

import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { isRegistered, register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen, emitTo } from '@tauri-apps/api/event';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { Image as TauriImage } from '@tauri-apps/api/image';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';

import { Folder, BufferItem, TabType, FloatingNoteSnapshot, FloatingNoteScheduleItem } from './types';
import { SystemQuickAccessIcon } from './components/QuickIcons';
import BufferItemCard from './components/BufferItemCard';
import { RoundedSelect, type RoundedSelectOption } from './components/RoundedSelect';
import { clamp } from './features/common';
import {
  CANVAS_BASE_HEIGHT,
  CANVAS_BASE_WIDTH,
  CANVAS_EDGE_AUTOSCROLL_MARGIN,
  CANVAS_EDGE_AUTOSCROLL_SPEED,
  CANVAS_GROW_CHUNK,
  CANVAS_MAX_IMAGE_WIDTH,
  CANVAS_MAX_SCALE,
  CANVAS_MIN_IMAGE_WIDTH,
  CANVAS_MIN_SCALE,
  type CanvasFolderImportPrompt,
  type CanvasAiGeneratedOutput,
  type CanvasAiProvider,
  type CanvasImageItem,
  type CanvasItemBox,
  type CanvasResizeCorner,
  type CanvasSelectionBox,
} from './features/canvasModel';
import {
  SCHEDULE_PRIORITY_OPTIONS,
  addLocalDays,
  buildScheduleItemsFromText,
  compareCalendarEvents,
  formatCalendarPreviewTitle,
  formatScheduleDateLabel,
  getCalendarDayMeta,
  getCalendarMiniEventClass,
  getCalendarNotificationBody,
  getLocalDateKey,
  getSchedulePriorityClass,
  getScheduleTextContent,
  normalizeSchedulePriority,
  startOfLocalDay,
  type CalendarScheduleEvent,
  type SchedulePriority,
} from './features/calendarModel';
import {
  ALCHEMY_CARD_WIDTH,
  AlchemyDrawerCard,
  SILICONFLOW_DEFAULT_ENDPOINT,
  SILICONFLOW_DEFAULT_MODEL,
  SILICONFLOW_VISION_MODEL_FALLBACKS,
  SILICONFLOW_VISION_MODEL_LABELS,
  buildLocalAlchemyResult,
  buildLocalPaletteOnlyResult,
  getAlchemySearchText,
  getAlchemyState,
  isAlchemyCandidate,
  isSiliconFlowProvider,
  isSiliconFlowVisionModel,
  replaceFirstItemRemark,
  type AiAnalysisConfig,
  type AlchemyBufferItem,
  type AlchemyResult,
} from './features/alchemy';
import {
  FLOATING_NOTE_DESTROY_BRIDGE_KEY,
  FLOATING_NOTE_LABELS,
  FLOATING_NOTE_SOURCE_BRIDGE_KEY,
  FLOATING_NOTE_TEXT_BRIDGE_KEY,
  FLOATING_NOTE_TITLE_BRIDGE_KEY,
  FOLDERS_CACHE_STORAGE_KEY,
  MAX_FLOATING_NOTE_COUNT,
  OPEN_FLOATING_NOTES_STORAGE_KEY,
  TEXT_FLOATING_NOTE_SIZES,
  deleteFloatingNoteSnapshot,
  fitImageFloatingNoteSize,
  floatingNoteStorageKey,
  forgetOpenFloatingNoteLabel,
  getFolderTagIds,
  makeFloatingNoteSnapshot,
  readFloatingNoteSnapshot,
  readFloatingNoteViewState,
  readOpenFloatingNoteLabels,
  readImageAspect,
  rememberOpenFloatingNoteLabel,
  writeOpenFloatingNoteLabels,
} from './features/floatingNotes';
import { EdgeTrigger } from './features/EdgeTrigger';
import { clearLegacyStartupFlags, isLaunchIntroDoneThisPage, markLaunchIntroDoneThisPage } from './features/startup';
import {
  CALENDAR_COMPACT_CANVAS_WIDTH,
  CALENDAR_COMPACT_DRAWER_WIDTH,
  DEFAULT_DRAWER_HEIGHT,
  DEFAULT_DRAWER_WIDTH,
  DRAWER_ANIM_MS,
  DRAWER_CONTENT_X_PADDING,
  DRAWER_SIDE_RAIL_WIDTH,
  MAX_DRAWER_HEIGHT,
  MAX_DRAWER_WIDTH,
  MIN_DRAWER_HEIGHT,
  MIN_DRAWER_WIDTH,
  getStoredDrawerSize,
  migrateDrawerSizeDefaults,
} from './features/drawerPrefs';
import { EDGE_WIDTH, getStoredTriggerMode, type TriggerMode } from './features/triggerModel';
import {
  getFileExtension,
  getNameFromUrl,
  getWebImageFromDataTransfer,
  isProbablyUrl,
  normalizeDraggedUrl,
} from './features/dragData';
import {
  AODUO_AI_ENDPOINT_DEFAULT,
  AODUO_AI_IMAGE_MODEL_DEFAULT,
  AODUO_AI_IMAGE_MODEL_OPTIONS,
  CANVAS_AI_PROVIDER_OPTIONS,
  OPENAI_COMPATIBLE_ENDPOINT_DEFAULT,
  OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT,
  OPENAI_COMPATIBLE_IMAGE_MODEL_OPTIONS,
  XAIS_CHAT_ENDPOINT_DEFAULT,
  XAIS_CHAT_IMAGE_MODEL_DEFAULT,
  XAIS_CHAT_IMAGE_MODEL_OPTIONS,
  XAIS_CHAT_VIDEO_MODEL_DEFAULT,
  XAIS_CHAT_VIDEO_MODEL_OPTIONS,
  generateCanvasAiProviderImages,
  generateCanvasAiProviderVideos,
} from './features/canvasAiImage';

type CanvasGeneratedListEntry = {
  id: string;
  canvasItem: CanvasImageItem;
  item: BufferItem;
  ai?: NonNullable<CanvasImageItem['ai']>;
};
type CanvasWorkflowNodeTemplate = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  item: Pick<BufferItem, 'type' | 'content'> & Partial<BufferItem>;
  inputs?: string[];
  ai?: Partial<NonNullable<CanvasImageItem['ai']>>;
};
type CanvasWorkflowTemplate = {
  id: string;
  label: string;
  hint: string;
  nodes: CanvasWorkflowNodeTemplate[];
  createdAt?: number;
  builtin?: boolean;
};
type CanvasWorkflowSaveDraft = {
  label: string;
  defaultLabel: string;
  nodes: CanvasWorkflowNodeTemplate[];
  bounds: CanvasItemBox;
  externalInputIds: string[];
  selectedItemIds: string[];
  aiCount: number;
};
type CanvasWorkflowRuntimeNodeSnapshot = {
  templateId: string;
  item?: Partial<BufferItem>;
  ai?: Partial<NonNullable<CanvasImageItem['ai']>>;
};
type CanvasWorkflowExpandedGroup = {
  groupId: string;
  templateId: string;
  workflowId: string;
  workflowLabel: string;
  workflowHint: string;
  workflowBuiltin?: boolean;
  module: CanvasImageItem;
  expandedAt: number;
};

const appWindow = getCurrentWindow();
clearLegacyStartupFlags();
const LazyFloatingNoteHost = React.lazy(() => (
  import('./features/FloatingNoteHost').then(module => ({ default: module.FloatingNoteHost }))
));
type DrawerTabType = TabType | 'alchemy' | 'notes' | 'calendar';
type DrawerUndoSnapshot = {
  items: BufferItem[];
  folders: Folder[];
  activeFolderId: string;
  activeTab: DrawerTabType;
  openFloatingNoteLabels: string[];
  floatingNotes: Array<{ label: string; snapshot: FloatingNoteSnapshot }>;
  label: string;
  createdAt: number;
};
type ConfirmDialogAction = {
  label: string;
  onClick: () => void | Promise<void>;
  className?: string;
  title?: string;
};
type ConfirmDialogState = {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  actions?: ConfirmDialogAction[];
};

const DRAWER_UNDO_LIMIT = 8;
type CanvasUndoSnapshot = {
  items: CanvasImageItem[];
  selectedIds: string[];
  size: { width: number; height: number };
  scroll: { left: number; top: number };
  label: string;
  createdAt: number;
};

const CANVAS_UNDO_LIMIT = 6;
const CANVAS_STATE_SAVE_DEBOUNCE_MS = 320;
const DRAWER_ITEMS_SAVE_DEBOUNCE_MS = 360;
const DATA_THUMBNAIL_KEEP_MAX_CHARS = 96 * 1024;

type CanvasPersistedState = {
  items: CanvasImageItem[];
  size: { width: number; height: number };
  scale: number;
  scroll: { left: number; top: number };
  updatedAt: number;
};

const isDataImageSourceValue = (value?: string | null) => (
  /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(String(value || '').trim())
);

const isDataVideoSourceValue = (value?: string | null) => (
  /^data:video\/[a-zA-Z0-9.+-]+;base64,/i.test(String(value || '').trim())
);

const isDataMediaSourceValue = (value?: string | null) => (
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

const stripHeavyDataThumbnail = (item: BufferItem): BufferItem => {
  const nextItem = stripDataImageProvenance(item);
  const thumbnail = nextItem.thumbnail || '';
  if (!isDataImageSourceValue(thumbnail) || thumbnail.length <= DATA_THUMBNAIL_KEEP_MAX_CHARS) {
    return nextItem;
  }
  const next = nextItem === item ? { ...item } : { ...nextItem };
  next.thumbnail = undefined;
  return next;
};

const compactFloatingNoteSnapshot = (snapshot: FloatingNoteSnapshot): FloatingNoteSnapshot => {
  const thumbnail = snapshot.thumbnail || '';
  if (!isDataImageSourceValue(thumbnail) || thumbnail.length <= DATA_THUMBNAIL_KEEP_MAX_CHARS) {
    return snapshot;
  }
  return { ...snapshot, thumbnail: undefined };
};

const stripCanvasItemDataImageProvenance = (item: CanvasImageItem): CanvasImageItem => {
  const nextItem = stripHeavyDataThumbnail(item.item);
  return nextItem === item.item ? item : { ...item, item: nextItem };
};

const normalizeInterruptedCanvasAiRun = (item: CanvasImageItem): CanvasImageItem => {
  const cleanItem = stripCanvasItemDataImageProvenance(item);
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
  if (cleanItem.ai?.status !== 'working') return cleanItem;
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

const sanitizeCanvasPersistedState = (value: unknown): CanvasPersistedState => {
  const record = value && typeof value === 'object' ? value as Partial<CanvasPersistedState> : {};
  const rawSize = record.size && typeof record.size === 'object' ? record.size : {};
  const rawScroll = record.scroll && typeof record.scroll === 'object' ? record.scroll : {};
  const size = {
    width: clamp(Number((rawSize as { width?: unknown }).width) || CANVAS_BASE_WIDTH, CANVAS_BASE_WIDTH, 20000),
    height: clamp(Number((rawSize as { height?: unknown }).height) || CANVAS_BASE_HEIGHT, CANVAS_BASE_HEIGHT, 20000),
  };
  const scroll = {
    left: Math.max(0, Number((rawScroll as { left?: unknown }).left) || 0),
    top: Math.max(0, Number((rawScroll as { top?: unknown }).top) || 0),
  };
  return {
    items: Array.isArray(record.items) ? record.items.map(normalizeInterruptedCanvasAiRun) : [],
    size,
    scale: clamp(Number(record.scale) || 1, CANVAS_MIN_SCALE, CANVAS_MAX_SCALE),
    scroll,
    updatedAt: Number(record.updatedAt) || 0,
  };
};

const cloneDrawerValue = <T,>(value: T): T => {
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch (_) {}
  return JSON.parse(JSON.stringify(value));
};

type CloudflaredPublicImageUrlsResult = {
  shareId: string;
  urls: string[];
};

type CanvasFolderImagePickerState = CanvasFolderImportPrompt & {
  x: number;
  y: number;
};

const getCanvasAiErrorSummary = (error?: string | null) => {
  const message = String(error || '').replace(/\s+/g, ' ').trim();
  if (!message) return '生成失败，请重试';
  if (/cloudflared|trycloudflare|Cloudflare Tunnel/i.test(message)) {
    return '本地参考图公网分享失败：cloudflared 没有拿到可用链接。请稍后重试，或先改用网络图片作为参考图。';
  }
  return message.length > 180 ? `${message.slice(0, 180)}...` : message;
};

const TABS: { id: DrawerTabType; label: string; icon: any }[] = [
  { id: 'all', label: '全部', icon: LayoutGrid },
  { id: 'image', label: '图片', icon: ImageIcon },
  { id: 'text', label: '文本', icon: Type },
  { id: 'video', label: '视频', icon: Film },
  { id: 'file', label: '文件', icon: FileIcon },
  { id: 'alchemy', label: '炼金', icon: Sparkles },
  { id: 'calendar', label: '日历', icon: CalendarDays },
];

const CALENDAR_NOTIFICATIONS_ENABLED_STORAGE_KEY = 'drawer_calendar_notifications_enabled';
const CALENDAR_NOTIFICATION_SENT_STORAGE_PREFIX = 'drawer_calendar_notification_sent_';
const CALENDAR_NOTIFICATION_HOURS = [10, 15];
const CALENDAR_NEW_NOTE_TARGET = '__new_calendar_schedule_note__';
const SNIP_RESTORE_DRAWER_STORAGE_KEY = 'drawer_snip_restore_drawer';
const CANVAS_FALLBACK_IMAGE_WIDTH = 360;
const CANVAS_FALLBACK_IMAGE_HEIGHT = 260;
const CANVAS_INITIAL_IMAGE_MAX_WIDTH = 720;
const CANVAS_INITIAL_IMAGE_MAX_HEIGHT = 560;
const IMAGE_THUMBNAIL_MAX_WIDTH = 360;
const IMAGE_THUMBNAIL_MAX_HEIGHT = 240;
const IMAGE_THUMBNAIL_LEGACY_MAX_WIDTH = 360;
const IMAGE_THUMBNAIL_LEGACY_MAX_HEIGHT = 240;
const VIDEO_THUMBNAIL_MAX_WIDTH = 360;
const VIDEO_THUMBNAIL_MAX_HEIGHT = 220;
const DATA_THUMBNAIL_RECOMPRESS_MIN_CHARS = 64 * 1024;
const VIDEO_THUMBNAIL_BLOB_LIMIT_BYTES = 24 * 1024 * 1024;
const BLANK_NOTE_CREATE_LOCK_STORAGE_KEY = 'drawer_blank_note_create_lock';
const SNIP_CAPTURE_LOCK_STORAGE_KEY = 'drawer_snip_capture_lock';
const FLOATING_NOTE_CREATE_LOCK_STORAGE_PREFIX = 'drawer_floating_note_create_lock_';
const DRAWER_INITIAL_RENDER_LIMIT = 48;
const DRAWER_RENDER_BATCH_SIZE = 32;
const DRAWER_RENDER_LOAD_AHEAD_PX = 640;
const CANVAS_NAV_WIDTH = 188;
const CANVAS_NAV_HEIGHT = 116;
const CANVAS_AI_PROVIDER_STORAGE_KEY = 'drawer_canvas_ai_provider';
const CANVAS_AI_PROVIDER_DEFAULT_VERSION_STORAGE_KEY = 'drawer_canvas_ai_provider_default_version';
const CANVAS_AI_PROVIDER_DEFAULT_VERSION = 'xais-chat-default';
const CANVAS_AI_API_KEY_STORAGE_KEY = 'drawer_canvas_ai_api_key';
const CANVAS_AI_API_KEY_STORAGE_PREFIX = 'drawer_canvas_ai_api_key_';
const CANVAS_AI_ENDPOINT_STORAGE_KEY = 'drawer_canvas_ai_endpoint';
const CANVAS_AI_ENDPOINT_STORAGE_PREFIX = 'drawer_canvas_ai_endpoint_';
const CANVAS_AI_OPENAI_MODELS_STORAGE_KEY = 'drawer_canvas_ai_openai_models';
const CANVAS_AI_XAIS_MODELS_STORAGE_KEY = 'drawer_canvas_ai_xais_models';
const CANVAS_AI_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];
const CANVAS_AI_OUTPUT_FORMATS = ['jpg', 'png'];
const CANVAS_AI_COUNTS = [1, 2, 3, 4];
const CANVAS_AI_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'];
const CANVAS_AI_VIDEO_DURATIONS = Array.from({ length: 12 }, (_, index) => index + 4);
const CANVAS_PASTE_OFFSET = 54;
const CANVAS_AI_DEFAULT_ASPECT_RATIO = '16:9';
const CANVAS_AI_DEFAULT_OUTPUT_FORMAT = 'jpg';
const CANVAS_AI_DEFAULT_COUNT = 1;
const CANVAS_AI_DEFAULT_VIDEO_DURATION = 15;
const CANVAS_AI_DEFAULT_VIDEO_RESOLUTION = '720p';
const CANVAS_AI_VIDEO_REFERENCE_SHARE_KEEPALIVE_MS = 30 * 60 * 1000;
const CANVAS_AI_INPUT_IMAGE_MAX_EDGE = 1920;
const CANVAS_AI_INPUT_IMAGE_MIN_EDGE = 1536;
const CANVAS_AI_INPUT_IMAGE_QUALITY = 0.9;
const CANVAS_AI_INPUT_IMAGE_MIN_QUALITY = 0.82;
const CANVAS_AI_INPUT_IMAGE_TARGET_BYTES = 2.5 * 1024 * 1024;
const STARTUP_CONSENT_DELAY_MS = 15000;
const CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY = 'drawer_cloudflared_disclaimer_accepted';
const CANVAS_CONNECTION_HANDLE_OUTSET = 10;
const CANVAS_SELECTION_RADIUS = 18;
const CANVAS_NODE_RADIUS = 20;
const AI_GENERATED_FOLDER_ID = 'ai_generated_images';
const AI_GENERATED_FOLDER_NAME = 'AI生图';
const AI_GENERATED_FOLDER_COLOR = '#06b6d4';
const AI_GENERATED_VIDEO_FOLDER_ID = 'ai_generated_videos';
const AI_GENERATED_VIDEO_FOLDER_NAME = 'AI视频';
const AI_GENERATED_VIDEO_FOLDER_COLOR = '#10b981';
const CANVAS_AI_PROVIDER_SELECT_OPTIONS: RoundedSelectOption[] = CANVAS_AI_PROVIDER_OPTIONS.map(provider => ({
  value: provider.value,
  label: provider.label,
}));
const CANVAS_AI_DEFAULT_PROVIDER: CanvasAiProvider = 'xais-chat';
const CANVAS_AI_PROVIDER_VALUES: CanvasAiProvider[] = ['xais-chat', 'openai-compatible', 'aoduo-ai'];
const CANVAS_AI_ASPECT_RATIO_OPTIONS: RoundedSelectOption[] = CANVAS_AI_ASPECT_RATIOS.map(ratio => ({
  value: ratio,
  label: ratio,
}));
const CANVAS_AI_OUTPUT_FORMAT_OPTIONS: RoundedSelectOption[] = CANVAS_AI_OUTPUT_FORMATS.map(format => ({
  value: format,
  label: format.toUpperCase(),
}));
const CANVAS_AI_COUNT_OPTIONS: RoundedSelectOption[] = CANVAS_AI_COUNTS.map(count => ({
  value: String(count),
  label: String(count),
}));
const CANVAS_AI_VIDEO_RESOLUTION_OPTIONS: RoundedSelectOption[] = CANVAS_AI_VIDEO_RESOLUTIONS.map(resolution => ({
  value: resolution,
  label: resolution,
}));
const CANVAS_AI_VIDEO_DURATION_OPTIONS: RoundedSelectOption[] = CANVAS_AI_VIDEO_DURATIONS.map(duration => ({
  value: String(duration),
  label: `${duration}秒`,
}));
const CANVAS_AI_VIDEO_INPUT_MODE_OPTIONS: RoundedSelectOption[] = [
  { value: 'REF', label: '参考图' },
  { value: 'FLF', label: '首尾帧' },
];
const CANVAS_AI_NODE_ICON_SELECT_CLASS = 'h-8 w-9 justify-center gap-0.5 rounded-[10px] border border-transparent bg-transparent px-0 text-stone-500 hover:bg-stone-950/[0.04] hover:text-stone-800 dark:text-white/62 dark:hover:bg-white/[0.07] dark:hover:text-white';
const CANVAS_AI_NODE_TEXT_SELECT_CLASS = 'h-8 justify-center gap-0.5 rounded-[10px] border border-transparent bg-transparent px-2 text-[11px] font-black text-stone-600 hover:bg-stone-950/[0.04] hover:text-stone-900 dark:text-white/70 dark:hover:bg-white/[0.07] dark:hover:text-white';
const CANVAS_AI_NODE_COUNT_SELECT_CLASS = 'h-8 w-11 justify-center gap-0.5 rounded-[10px] border border-transparent bg-transparent px-1.5 text-[11px] font-black text-stone-600 hover:bg-stone-950/[0.04] hover:text-stone-900 dark:text-white/70 dark:hover:bg-white/[0.07] dark:hover:text-white';
const CANVAS_AI_NODE_CHEVRON_CLASS = 'h-2.5 w-2.5';
const CANVAS_AI_NODE_SELECT_MENU_CLASS = '!border-stone-200/80 !bg-white/98 !text-stone-700 shadow-2xl shadow-black/15 dark:!border-white/10 dark:!bg-[#171717]/98 dark:!text-white dark:shadow-black/35';
const CANVAS_AI_NODE_SELECT_OPTION_CLASS = '!text-stone-600 hover:!bg-stone-100 hover:!text-stone-950 dark:!text-white/78 dark:hover:!bg-white/10 dark:hover:!text-white';
const CANVAS_AI_NODE_SELECT_ACTIVE_CLASS = '!bg-stone-900 !text-white dark:!bg-white/14 dark:!text-white';
const CANVAS_AI_PANEL_SELECT_CLASS = 'h-[34px] w-full rounded-[14px] border border-stone-200/80 bg-white/76 px-3 text-xs font-medium text-stone-700 shadow-sm shadow-black/[0.02] hover:bg-white dark:border-stone-700 dark:bg-stone-950/36 dark:text-stone-100 dark:hover:bg-stone-900/70';
const DRAWER_TOOL_BUTTON_BASE_CLASS = 'p-1.5 rounded-[14px] transition-colors cursor-pointer shadow-sm bg-white/72 text-stone-500 dark:bg-stone-800/65 backdrop-blur-md dark:text-stone-400';
const CANVAS_SIDE_TOOL_CLASS = 'flex h-10 w-[68px] shrink-0 items-center justify-start gap-1.5 overflow-hidden rounded-full border bg-white/88 px-2 text-[10px] font-black text-stone-700 shadow-[0_8px_20px_rgba(15,23,42,0.10)] backdrop-blur-2xl transition-[transform,background-color,border-color] duration-200 hover:-translate-y-px dark:border-white/10 dark:bg-stone-950/70 dark:text-stone-100 dark:hover:bg-stone-900/90';
const CANVAS_SIDE_SELECT_CLASS = 'relative h-10 w-[68px] shrink-0 items-center justify-start gap-1.5 overflow-hidden rounded-full border bg-white/88 px-2 text-[10px] font-black text-stone-700 shadow-[0_8px_20px_rgba(15,23,42,0.10)] backdrop-blur-2xl transition-[width,transform,background-color,border-color] duration-200 hover:w-[118px] hover:-translate-y-px dark:border-white/10 dark:bg-stone-950/70 dark:text-stone-100 dark:hover:bg-stone-900/90';
const CANVAS_SIDE_CHEVRON_FLOAT_CLASS = 'pointer-events-none absolute right-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full bg-white/90 opacity-0 shadow-sm ring-2 ring-white/80 transition-opacity group-hover/rounded-select:opacity-100 dark:bg-stone-950/90 dark:ring-stone-950/70';
const CANVAS_SIDE_EXPAND_TOOL_CLASS = `group/canvas-tool ${CANVAS_SIDE_TOOL_CLASS} transition-[width,transform,background-color,border-color] hover:w-[118px] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45`;
const DRAWER_FOLDER_TONES = [
  {
    active: 'bg-blue-500 text-white shadow-md shadow-blue-500/20 dark:bg-blue-400 dark:text-stone-950 dark:shadow-blue-950/30',
    soft: 'hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-400/12 dark:hover:text-blue-200',
    drag: 'ring-2 ring-blue-300 bg-blue-50 text-blue-600 dark:ring-blue-400/40 dark:bg-blue-400/14 dark:text-blue-200',
    label: 'text-blue-600 dark:text-blue-300',
    badge: 'bg-blue-500 dark:bg-blue-400 dark:text-stone-950',
  },
];
const CANVAS_AI_GENERATOR_NODE_DEFAULT_WIDTH = 560;
const CANVAS_AI_VIDEO_GENERATOR_NODE_DEFAULT_WIDTH = 760;
const CANVAS_AI_WORKFLOW_MODULE_DEFAULT_WIDTH = 590;
const CANVAS_AI_NODE_GRID_GAP = 8;
const CANVAS_AI_MAX_OUTPUT_COUNT = 64;
const CANVAS_WORKFLOW_MAX_OUTPUT_SLOTS = 64;
const parseCanvasAspectRatioValue = (aspectRatio = CANVAS_AI_DEFAULT_ASPECT_RATIO) => {
  const [rawW, rawH] = aspectRatio.split(':').map(value => Number(value));
  return rawW > 0 && rawH > 0 ? rawW / rawH : 16 / 9;
};
const getCanvasAiOutputTileLayout = (options?: {
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
const getCanvasAiPromptAutoHeight = (promptText = '', width = CANVAS_AI_GENERATOR_NODE_DEFAULT_WIDTH, expanded = false) => {
  if (!expanded) return 108;
  const text = promptText.trim();
  const charsPerLine = Math.max(26, Math.floor((width - 44) / 14));
  const visualLines = text
    ? Math.max(3, text.split(/\r?\n/).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0))
    : 3;
  return clamp(visualLines * 28 + 24, 180, 320);
};
const getCanvasAiNodeAutoSize = (options?: {
  type?: 'image-generator' | 'video-generator' | 'workflow';
  aspectRatio?: string;
  count?: number;
  outputCount?: number;
  hasPreset?: boolean;
  hasError?: boolean;
  promptText?: string;
  promptExpanded?: boolean;
  showOutputPreview?: boolean;
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
  const promptHeight = isWorkflow ? 118 : getCanvasAiPromptAutoHeight(options?.promptText, width, !!options?.promptExpanded);
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
type CanvasAiPromptPreset = {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  count?: number;
};
const CANVAS_AI_PROMPT_PRESETS: CanvasAiPromptPreset[] = [
  {
    id: 'product-render',
    label: '产品渲染',
    hint: '高级工业设计棚拍',
    aspectRatio: '16:9',
    outputFormat: 'jpg',
    prompt: `基于连接的参考图，为图中的产品生成一张高级工业设计产品渲染图。

视觉风格：
- 高端消费电子产品摄影
- 简约深色背景
- 暗光环境
- 柔和轮廓光
- 产品边缘有高级高光
- 轻微虚焦背景
- 真实材质表现
- 干净、克制、有质感

产品要求：
- 保持原产品结构、比例、按键、接口、分件线不变
- 不改变产品功能布局
- 表面干净，不要脏污、油腻、划痕
- 不要文字、不要 logo 乱生成、不要说明标签`,
  },
  {
    id: 'cmf-exploration',
    label: 'CMF 探索',
    hint: '材质与配色方向',
    aspectRatio: '16:9',
    outputFormat: 'jpg',
    prompt: `基于连接的参考图，为图中的产品做一张 CMF 设计探索图。

要求：
- 保持产品结构、比例、按键、接口、分件线不变
- 展示 3 个克制且高级的配色/材质方向
- 强调真实材质：金属、磨砂塑料、玻璃、织物或软触涂层
- 光线柔和，背景干净，构图像设计评审板
- 不要添加品牌 logo、文字标签或说明箭头`,
  },
  {
    id: 'lifestyle-scene',
    label: '场景氛围',
    hint: '真实使用场景',
    aspectRatio: '16:9',
    outputFormat: 'jpg',
    prompt: `基于连接的参考图，为图中的产品生成一张真实生活方式场景图。

场景方向：
- 现代、干净、有审美的居家或办公环境
- 产品是画面主角，构图自然，不要像广告硬广
- 光线柔和，有轻微景深，材质真实

产品约束：
- 保持原产品结构和功能布局不变
- 不增加不存在的屏幕内容、按钮、接口或品牌标识
- 不要文字、不要说明标签、不要夸张特效`,
  },
  {
    id: 'detail-hero',
    label: '细节特写',
    hint: '边缘高光与材质',
    aspectRatio: '16:9',
    outputFormat: 'jpg',
    prompt: `基于连接的参考图，为图中的产品生成一张高级产品细节特写图。

画面要求：
- 聚焦关键边缘、倒角、按键、接口或分件线
- 微距产品摄影质感，浅景深，背景干净
- 边缘有精致高光，材质真实可信
- 画面克制，不要过度锐化或赛博风

产品约束：
- 不改变原结构、比例、功能布局
- 表面干净，不要划痕、污渍、指纹
- 不要文字、不要 logo 乱生成、不要说明标签`,
  },
];
const makeCanvasWorkflowAiNode = (
  id: string,
  label: string,
  hint: string,
  prompt: string,
  x: number,
  y: number,
  inputs: string[] = [],
  aspectRatio = '16:9'
): CanvasWorkflowNodeTemplate => {
  const size = getCanvasAiNodeAutoSize({
    type: 'image-generator',
    aspectRatio,
    count: 1,
    hasPreset: true,
  });
  return {
    id,
    x,
    y,
    width: size.width,
    height: size.height,
    inputs,
    item: {
      id,
      type: 'text',
      content: '',
      name: `AI ${label}`,
      remark: hint,
      createdAt: 0,
      isQuickAccess: false,
    },
    ai: {
      type: 'image-generator',
      presetId: `workflow-${id}`,
      presetLabel: label,
      presetPrompt: prompt,
      aspectRatio,
      outputFormat: 'jpg',
      count: 1,
      status: 'idle',
    },
  };
};
const CANVAS_BUILT_IN_WORKFLOWS: CanvasWorkflowTemplate[] = [
  {
    id: 'industrial-design-basic',
    label: '基础工业设计',
    hint: '线稿 -> 效果图 -> 细节 / 多角度 / 场景',
    builtin: true,
    nodes: [
      makeCanvasWorkflowAiNode(
        'industrial-render',
        '线稿转效果图',
        '从线稿生成效果图',
        `基于连接的线稿、草图或产品参考图，生成一张可信的工业设计效果图。

要求：
- 保留原始产品比例、结构、功能布局和关键轮廓
- 将线稿转成真实可评审的产品渲染
- 材质、倒角、分件线、按键、接口表现清晰
- 构图干净，像工业设计评审里的主效果图
- 不要文字、不要 logo 乱生成、不要说明标签`,
        0,
        0,
        [],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'industrial-detail',
        '细节图',
        '从效果图生成细节特写',
        `基于连接的产品效果图，生成一张高级产品细节特写图。

要求：
- 聚焦关键边缘、倒角、按键、接口、分件线或材质交界
- 微距产品摄影质感，浅景深，边缘有精致高光
- 保持产品结构与功能布局一致
- 不要文字、不要 logo 乱生成、不要说明箭头`,
        480,
        -120,
        ['industrial-render'],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'industrial-multiview',
        '多角度设计图',
        '从效果图生成多角度设计图',
        `基于连接的产品效果图，生成同一产品的多角度设计图。

要求：
- 展示正面、侧面、背面、3/4 角度等多个视角
- 所有视角保持同一产品结构、比例、CMF 和细节一致
- 像工业设计评审板，排版干净，背景简洁
- 不要文字标签、不要说明箭头、不要品牌 logo 乱生成`,
        480,
        420,
        ['industrial-render'],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'industrial-scene',
        '场景图',
        '从效果图生成使用场景',
        `基于连接的产品效果图，生成真实生活方式或办公使用场景图。

要求：
- 产品是画面主角，环境现代、干净、有审美
- 光线柔和，有轻微景深，材质真实可信
- 保持产品结构、比例、按键、接口和分件线一致
- 不要文字、不要 logo 乱生成、不要夸张特效`,
        960,
        150,
        ['industrial-render'],
        '16:9'
      ),
    ],
  },
  {
    id: 'cmf-review',
    label: 'CMF 评审',
    hint: '参考图 -> CMF 方向 -> 细节特写',
    builtin: true,
    nodes: [
      makeCanvasWorkflowAiNode(
        'cmf-board',
        'CMF 方向板',
        '生成材质与配色方向',
        CANVAS_AI_PROMPT_PRESETS.find(preset => preset.id === 'cmf-exploration')?.prompt || '',
        0,
        0,
        [],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'cmf-detail',
        'CMF 细节特写',
        '生成材质细节图',
        `基于连接的 CMF 方向图，生成一张产品材质细节特写。

要求：
- 强调材质纹理、表面工艺、倒角高光和颜色过渡
- 保持产品结构一致
- 画面像设计评审中的材质细节页
- 不要文字、不要品牌标识、不要说明箭头`,
        480,
        0,
        ['cmf-board'],
        '16:9'
      ),
    ],
  },
  {
    id: 'ecommerce-showcase',
    label: '电商展示',
    hint: '主图 -> 细节图 / 场景图',
    builtin: true,
    nodes: [
      makeCanvasWorkflowAiNode(
        'commerce-hero',
        '电商主图',
        '生成产品主视觉',
        `基于连接的产品参考图，生成一张干净高级的电商产品主图。

要求：
- 产品居中，轮廓清晰，材质真实
- 背景简洁但不空洞，适合商品展示
- 保持产品结构和功能布局一致
- 不要促销文字、不要 logo 乱生成、不要水印`,
        0,
        0,
        [],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'commerce-detail',
        '卖点细节图',
        '生成产品细节展示',
        CANVAS_AI_PROMPT_PRESETS.find(preset => preset.id === 'detail-hero')?.prompt || '',
        480,
        -120,
        ['commerce-hero'],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'commerce-scene',
        '使用场景图',
        '生成真实场景图',
        CANVAS_AI_PROMPT_PRESETS.find(preset => preset.id === 'lifestyle-scene')?.prompt || '',
        480,
        420,
        ['commerce-hero'],
        '16:9'
      ),
    ],
  },
];
const CANVAS_AI_PROMPT_PRESET_PLACEHOLDER = '__canvas_ai_prompt_preset__';
const CANVAS_AI_PROMPT_PRESET_ADD_VALUE = '__canvas_ai_prompt_preset_add__';
const CANVAS_AI_PROMPT_PRESET_MANAGE_VALUE = '__canvas_ai_prompt_preset_manage__';
const CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY = 'drawer_canvas_ai_custom_prompt_presets';
const CANVAS_WORKFLOW_SELECT_PLACEHOLDER = '__canvas_workflow_select__';
const CANVAS_WORKFLOW_SAVE_SELECTION_VALUE = '__canvas_workflow_save_selection__';
const CANVAS_WORKFLOW_MANAGE_VALUE = '__canvas_workflow_manage__';
const CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY = 'drawer_canvas_custom_workflows';
const CANVAS_TEMPLATE_EXPORT_TYPE = 'inspiration-drawer-canvas-templates';
const CANVAS_TEMPLATE_EXPORT_VERSION = 1;
const getCanvasAiPresetPrompt = (preset?: CanvasAiPromptPreset) => preset?.prompt || '';
const normalizeCanvasAiPromptPreset = (value: unknown): CanvasAiPromptPreset | null => {
  const record = value && typeof value === 'object' ? value as Partial<CanvasAiPromptPreset> : {};
  const label = typeof record.label === 'string' ? record.label.trim().slice(0, 24) : '';
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
  if (!label || !prompt) return null;
  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `custom-${Math.random().toString(36).substring(2, 9)}`,
    label,
    hint: typeof record.hint === 'string' && record.hint.trim() ? record.hint.trim().slice(0, 48) : '自定义 Prompt 预设',
    prompt,
    aspectRatio: typeof record.aspectRatio === 'string' ? record.aspectRatio : undefined,
    resolution: typeof record.resolution === 'string' ? record.resolution : undefined,
    outputFormat: typeof record.outputFormat === 'string' ? record.outputFormat : undefined,
    count: typeof record.count === 'number' ? record.count : undefined,
  };
};
const readCustomCanvasAiPromptPresets = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(normalizeCanvasAiPromptPreset).filter((item): item is CanvasAiPromptPreset => !!item)
      : [];
  } catch (_) {
    return [];
  }
};
const normalizeCanvasWorkflowTemplate = (value: unknown): CanvasWorkflowTemplate | null => {
  const record = value && typeof value === 'object' ? value as Partial<CanvasWorkflowTemplate> : {};
  const label = typeof record.label === 'string' ? record.label.trim().slice(0, 32) : '';
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : [];
  if (!label || rawNodes.length === 0) return null;

  const nodes = rawNodes.map((nodeValue, index) => {
    const node = nodeValue && typeof nodeValue === 'object'
      ? nodeValue as Partial<CanvasWorkflowNodeTemplate>
      : {};
    const rawItem = node.item && typeof node.item === 'object'
      ? node.item as Partial<BufferItem>
      : {};
    const itemType = rawItem.type === 'text' || rawItem.type === 'image' || rawItem.type === 'file' || rawItem.type === 'video'
      ? rawItem.type
      : 'text';
    const id = typeof node.id === 'string' && node.id.trim() ? node.id.trim() : `node-${index}`;
    return {
      id,
      x: Number(node.x) || 0,
      y: Number(node.y) || index * 220,
      width: clamp(Number(node.width) || 390, 160, 1200),
      height: clamp(Number(node.height) || 430, 120, 1200),
      item: {
        id,
        type: itemType,
        content: String(rawItem.content || ''),
        name: typeof rawItem.name === 'string' ? rawItem.name.slice(0, 80) : undefined,
        path: typeof rawItem.path === 'string' ? rawItem.path : undefined,
        url: typeof rawItem.url === 'string' ? rawItem.url : undefined,
        thumbnail: typeof rawItem.thumbnail === 'string' ? rawItem.thumbnail : undefined,
        sourceUrl: typeof rawItem.sourceUrl === 'string' ? rawItem.sourceUrl : undefined,
        originalUrl: typeof rawItem.originalUrl === 'string' ? rawItem.originalUrl : undefined,
        remark: typeof rawItem.remark === 'string' ? rawItem.remark : undefined,
        remarks: Array.isArray(rawItem.remarks)
          ? rawItem.remarks.map(remark => String(remark || '').trim()).filter(Boolean).slice(0, 12)
          : undefined,
        createdAt: 0,
        isQuickAccess: false,
      },
      inputs: Array.isArray(node.inputs)
        ? node.inputs.map(inputId => String(inputId || '').trim()).filter(Boolean)
        : [],
      ai: node.ai && typeof node.ai === 'object'
        ? {
          ...(node.ai as Partial<NonNullable<CanvasImageItem['ai']>>),
          outputs: [],
          status: 'idle' as const,
          error: undefined,
          generatedAt: undefined,
        }
        : undefined,
    } as CanvasWorkflowNodeTemplate;
  }).filter(node => node.ai?.type === 'image-generator' || !!node.item.type);

  if (nodes.length === 0 || !nodes.some(node => node.ai?.type === 'image-generator')) return null;
  return {
    id: typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `workflow-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    label,
    hint: typeof record.hint === 'string' && record.hint.trim()
      ? record.hint.trim().slice(0, 80)
      : '自定义工作流',
    nodes,
    createdAt: Number(record.createdAt) || Date.now(),
    builtin: !!record.builtin,
  };
};
const readCustomCanvasWorkflows = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(normalizeCanvasWorkflowTemplate).filter((item): item is CanvasWorkflowTemplate => !!item && !item.builtin)
      : [];
  } catch (_) {
    return [];
  }
};
const getCanvasAiDefaultModel = (provider: CanvasAiProvider, mediaType: 'image' | 'video' = 'image') => (
  mediaType === 'video'
    ? XAIS_CHAT_VIDEO_MODEL_DEFAULT
    : provider === 'xais-chat'
    ? XAIS_CHAT_IMAGE_MODEL_DEFAULT
    : provider === 'aoduo-ai'
      ? AODUO_AI_IMAGE_MODEL_DEFAULT
    : OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT
);
const getCanvasAiDefaultEndpoint = (provider: CanvasAiProvider) => (
  provider === 'xais-chat'
    ? XAIS_CHAT_ENDPOINT_DEFAULT
    : provider === 'aoduo-ai'
      ? AODUO_AI_ENDPOINT_DEFAULT
    : provider === 'openai-compatible'
      ? OPENAI_COMPATIBLE_ENDPOINT_DEFAULT
      : ''
);
const getCanvasAiModelOptions = (provider: CanvasAiProvider, mediaType: 'image' | 'video' = 'image') => (
  mediaType === 'video'
    ? XAIS_CHAT_VIDEO_MODEL_OPTIONS
    : provider === 'xais-chat'
    ? XAIS_CHAT_IMAGE_MODEL_OPTIONS
    : provider === 'aoduo-ai'
      ? AODUO_AI_IMAGE_MODEL_OPTIONS
    : OPENAI_COMPATIBLE_IMAGE_MODEL_OPTIONS
);
const readStoredCanvasAiOpenAiModels = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_OPENAI_MODELS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
  } catch (_) {
    return [];
  }
};
const readStoredCanvasAiXaisModels = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_XAIS_MODELS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
  } catch (_) {
    return [];
  }
};
const isCanvasAiEndpointEditable = (provider: CanvasAiProvider) => provider === 'openai-compatible' || provider === 'xais-chat';
const isCanvasAiEndpointVisible = (provider: CanvasAiProvider) => provider === 'openai-compatible';
const isCanvasAiRemoteModelProvider = (provider: CanvasAiProvider) => provider === 'openai-compatible' || provider === 'xais-chat';
const getCanvasAiEndpointPlaceholder = (provider: CanvasAiProvider) => (
  provider === 'xais-chat' ? XAIS_CHAT_ENDPOINT_DEFAULT : OPENAI_COMPATIBLE_ENDPOINT_DEFAULT
);
const normalizeCanvasAiXaisEndpoint = (endpoint: string) => {
  const trimmed = (endpoint || XAIS_CHAT_ENDPOINT_DEFAULT).trim().replace(/\/+$/, '');
  return trimmed
    .replace(/\/v1\/(?:models|images\/generations|images\/edits|chat\/completions)$/i, '/v1')
    .replace(/\/models$/i, '');
};
const getCanvasAiEndpointForRequest = (provider: CanvasAiProvider, endpoint: string) => {
  if (provider === 'xais-chat') {
    const trimmed = endpoint.trim();
    if (!trimmed || /api\.openai\.com|api\.lk888\.ai/i.test(trimmed)) {
      return XAIS_CHAT_ENDPOINT_DEFAULT;
    }
    return normalizeCanvasAiXaisEndpoint(trimmed);
  }
  return isCanvasAiEndpointEditable(provider)
    ? endpoint
    : getCanvasAiDefaultEndpoint(provider);
};
const getCanvasAiEndpointForModels = (provider: CanvasAiProvider, endpoint: string) => {
  if (provider !== 'xais-chat') return endpoint.trim();
  const base = normalizeCanvasAiXaisEndpoint(endpoint);
  return /\/v1$/i.test(base) ? base : `${base}/v1`;
};
const isCanvasAiXaisImageModel = (model: string) => {
  const normalized = model.trim();
  return /nano[_-]?banana/i.test(normalized)
    || /^xais[\s_-]?nano/i.test(normalized)
    || /^(?:image2|img2)(?:[\s_-]|$)/i.test(normalized)
    || /^xais[\s_-]?(?:image2|img2)(?:[\s_-]|$)/i.test(normalized)
    || normalized.toLowerCase() === 'c3f';
};
const isCanvasAiLikelyOpenAiImageModel = (model: string) => {
  const normalized = model.trim().toLowerCase();
  return /^gpt-image-\d/.test(normalized)
    || /^dall-e-\d/.test(normalized)
    || /(?:^|[-_/])(image|img|picture|photo|vision|visual|flux|sdxl|sd3|stable-diffusion|imagen|ideogram|recraft|seedream|jimeng|kolors|hidream|nano-banana|nanobanana)(?:$|[-_/])/i.test(model)
    || /(?:image|img|picture|photo|vision|visual|flux|sdxl|stable.?diffusion|imagen|ideogram|recraft|seedream|jimeng|kolors|hidream|nano.?banana)/i.test(model);
};
const isCanvasAiXaisWorkerModel = (model?: string | null) => {
  const normalized = String(model || '').trim();
  return /^(?:image2|img2)(?:[\s_-]|$)/i.test(normalized)
    || /^xais[\s_-]?(?:image2|img2)(?:[\s_-]|$)/i.test(normalized);
};
const getCanvasAiRemoteStorageKey = (provider: CanvasAiProvider) => (
  provider === 'xais-chat' ? CANVAS_AI_XAIS_MODELS_STORAGE_KEY : CANVAS_AI_OPENAI_MODELS_STORAGE_KEY
);
const sortCanvasAiModelsForProvider = (provider: CanvasAiProvider, models: string[]) => {
  if (provider !== 'xais-chat') return [...models].sort((a, b) => a.localeCompare(b));
  const preferred = XAIS_CHAT_IMAGE_MODEL_OPTIONS.map(option => option.value);
  return [...models].sort((a, b) => {
    const aIndex = preferred.indexOf(a);
    const bIndex = preferred.indexOf(b);
    if (aIndex >= 0 || bIndex >= 0) {
      if (aIndex < 0) return 1;
      if (bIndex < 0) return -1;
      return aIndex - bIndex;
    }
    return a.localeCompare(b);
  });
};
const normalizeCanvasAiProvider = (provider?: string | null): CanvasAiProvider => (
  CANVAS_AI_PROVIDER_VALUES.includes(provider as CanvasAiProvider)
    ? provider as CanvasAiProvider
    : CANVAS_AI_DEFAULT_PROVIDER
);
const getStoredCanvasAiProvider = () => {
  const storedProvider = localStorage.getItem(CANVAS_AI_PROVIDER_STORAGE_KEY);
  const storedVersion = localStorage.getItem(CANVAS_AI_PROVIDER_DEFAULT_VERSION_STORAGE_KEY);
  if (storedVersion !== CANVAS_AI_PROVIDER_DEFAULT_VERSION && storedProvider === 'aoduo-ai') {
    return CANVAS_AI_DEFAULT_PROVIDER;
  }
  return normalizeCanvasAiProvider(storedProvider);
};
const getCanvasAiApiKeyStorageKey = (provider: CanvasAiProvider) => `${CANVAS_AI_API_KEY_STORAGE_PREFIX}${provider}`;
const getCanvasAiEndpointStorageKey = (provider: CanvasAiProvider) => `${CANVAS_AI_ENDPOINT_STORAGE_PREFIX}${provider}`;
const getStoredCanvasAiApiKey = (provider: CanvasAiProvider) => {
  const scopedKey = localStorage.getItem(getCanvasAiApiKeyStorageKey(provider));
  if (scopedKey !== null) return scopedKey;
  if (provider === 'aoduo-ai') return localStorage.getItem(CANVAS_AI_API_KEY_STORAGE_KEY) || '';
  return '';
};
const getStoredCanvasAiEndpoint = (provider: CanvasAiProvider) => {
  const scopedEndpoint = (localStorage.getItem(getCanvasAiEndpointStorageKey(provider)) || '').trim();
  if (scopedEndpoint) return scopedEndpoint;
  const storedProvider = normalizeCanvasAiProvider(localStorage.getItem(CANVAS_AI_PROVIDER_STORAGE_KEY));
  const legacyEndpoint = (localStorage.getItem(CANVAS_AI_ENDPOINT_STORAGE_KEY) || '').trim();
  if (storedProvider === provider && legacyEndpoint) return legacyEndpoint;
  return getCanvasAiDefaultEndpoint(provider);
};
const getCanvasAiApiKeyPlaceholder = (provider: CanvasAiProvider) => (
  provider === 'xais-chat'
    ? 'Xais / DCHAI API Key'
    : provider === 'aoduo-ai'
      ? '中转2 API Key'
      : 'API Key'
);
const isCanvasAiGeneratorType = (type?: string | null) => type === 'image-generator' || type === 'video-generator';
const isCanvasAiGeneratedType = (type?: string | null) => type === 'generated-image' || type === 'generated-video';
const getCanvasAiMediaType = (ai?: CanvasImageItem['ai'] | null): 'image' | 'video' => (
  ai?.type === 'video-generator' || ai?.type === 'generated-video' ? 'video' : 'image'
);
const getCanvasAiNodeAutoSizeType = (ai?: CanvasImageItem['ai'] | null): 'image-generator' | 'video-generator' | 'workflow' => (
  ai?.type === 'workflow'
    ? 'workflow'
    : getCanvasAiMediaType(ai) === 'video'
      ? 'video-generator'
      : 'image-generator'
);
const getCanvasAiNodeTitle = (ai?: CanvasImageItem['ai'] | null) => (
  getCanvasAiMediaType(ai) === 'video' ? 'AI 视频节点' : 'AI 生图节点'
);
type CanvasContextMenuState = {
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

const acquireTimedLocalLock = (key: string, ttlMs: number) => {
  const now = Date.now();
  const owner = `${now}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    const raw = localStorage.getItem(key);
    const existing = raw ? JSON.parse(raw) : null;
    const existingTime = Number(existing?.time || 0);
    if (existingTime && now - existingTime < ttlMs) return null;
    localStorage.setItem(key, JSON.stringify({ owner, time: now }));
    const current = JSON.parse(localStorage.getItem(key) || '{}');
    return current?.owner === owner ? owner : null;
  } catch (_) {
    return owner;
  }
};

const releaseTimedLocalLock = (key: string, owner: string | null) => {
  if (!owner) return;
  try {
    const current = JSON.parse(localStorage.getItem(key) || '{}');
    if (current?.owner === owner) localStorage.removeItem(key);
  } catch (_) {}
};

const localLockKeyPart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
const emitFloatingNoteUpdated = (label: string, snapshot: FloatingNoteSnapshot) => (
  emitTo({ kind: 'WebviewWindow', label }, 'floating-note-updated', { ...snapshot, targetLabel: label })
);
const emitFloatingNoteSourceUpdated = (label: string, payload: Record<string, unknown>) => (
  emitTo({ kind: 'WebviewWindow', label }, 'floating-note-source-updated', { ...payload, targetLabel: label })
);

const getCanvasInitialImageSize = (naturalWidth = 0, naturalHeight = 0) => {
  if (naturalWidth > 0 && naturalHeight > 0) {
    const aspect = naturalWidth / Math.max(1, naturalHeight);
    let width = Math.min(naturalWidth, CANVAS_INITIAL_IMAGE_MAX_WIDTH, CANVAS_MAX_IMAGE_WIDTH);
    let height = width / aspect;
    if (height > CANVAS_INITIAL_IMAGE_MAX_HEIGHT) {
      height = CANVAS_INITIAL_IMAGE_MAX_HEIGHT;
      width = height * aspect;
    }
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }
  return { width: CANVAS_FALLBACK_IMAGE_WIDTH, height: CANVAS_FALLBACK_IMAGE_HEIGHT };
};

const readImageDisplaySize = (src: string) => new Promise<{ width: number; height: number }>((resolve) => {
  if (!src) {
    resolve(getCanvasInitialImageSize());
    return;
  }
  const image = new window.Image();
  image.onload = () => resolve(getCanvasInitialImageSize(image.naturalWidth, image.naturalHeight));
  image.onerror = () => resolve(getCanvasInitialImageSize());
  image.src = src;
});







function SnipOverlay() {
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isCaptureOverlayHidden, setIsCaptureOverlayHidden] = useState(false);
  const isMouseDownRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const captureInFlightRef = useRef(false);

  const waitForTransparentSnipFrame = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });

  const recoverAfterSnip = async () => {
    const size = getStoredDrawerSize();
    const mode = getStoredTriggerMode();
    const restoreDrawer = localStorage.getItem(SNIP_RESTORE_DRAWER_STORAGE_KEY) === 'true';
    await invoke('recover_after_snip', {
      restoreDrawer,
      width: size.width,
      height: size.height,
      mode,
    }).catch(() => invoke('hide_snip_window').catch(() => appWindow.hide().catch(() => {})));
  };

  const cancelSnip = async () => {
    if (captureInFlightRef.current) return;
    isMouseDownRef.current = false;
    setIsCaptureOverlayHidden(false);
    setSelection(null);
    await emitTo('main', 'snip-cancelled', {}).catch(() => {});
    await recoverAfterSnip();
  };

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    listen('snip-reset', () => {
      captureInFlightRef.current = false;
      isMouseDownRef.current = false;
      setIsCaptureOverlayHidden(false);
      setSelection(null);
    }).then(unlisten => unlisteners.push(unlisten));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      void cancelSnip();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      unlisteners.forEach(unlisten => unlisten());
    };
  }, []);

  const finishSelection = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isMouseDownRef.current || captureInFlightRef.current) return;
    isMouseDownRef.current = false;
    const rect = selection;
    if (!rect || rect.w < 10 || rect.h < 10) {
      await cancelSnip();
      return;
    }
    const selectionLockKey = `${SNIP_CAPTURE_LOCK_STORAGE_KEY}_selection_${localLockKeyPart([
      Math.round(rect.x),
      Math.round(rect.y),
      Math.round(rect.w),
      Math.round(rect.h),
      Math.round(window.innerWidth),
      Math.round(window.innerHeight),
    ].join('_'))}`;
    const selectionLockOwner = acquireTimedLocalLock(selectionLockKey, 5000);
    if (!selectionLockOwner) return;

    const noteX = event.screenX - (event.clientX - rect.x);
    const noteY = event.screenY - (event.clientY - rect.y);
    captureInFlightRef.current = true;
    flushSync(() => {
      setIsCaptureOverlayHidden(true);
      setSelection(null);
    });
    await waitForTransparentSnipFrame();

    const payload = {
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      noteX,
      noteY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
    try {
      const size = getStoredDrawerSize();
      const mode = getStoredTriggerMode();
      const restoreDrawer = localStorage.getItem(SNIP_RESTORE_DRAWER_STORAGE_KEY) === 'true';
      await invoke('complete_snip_selection', {
        ...payload,
        restoreDrawer,
        drawerWidth: size.width,
        drawerHeight: size.height,
        mode,
      });
    } catch (err) {
      await emitTo('main', 'snip-failed', { message: err instanceof Error ? err.message : String(err) }).catch(() => {});
      await recoverAfterSnip();
    } finally {
      captureInFlightRef.current = false;
      setIsCaptureOverlayHidden(false);
      setSelection(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] cursor-crosshair select-none bg-transparent"
      onContextMenu={(event) => {
        event.preventDefault();
        void cancelSnip();
      }}
      onMouseDown={(event) => {
        if (event.button !== 0 || captureInFlightRef.current) return;
        isMouseDownRef.current = true;
        setIsCaptureOverlayHidden(false);
        startRef.current = { x: event.clientX, y: event.clientY };
        setSelection({ x: event.clientX, y: event.clientY, w: 0, h: 0 });
      }}
      onMouseMove={(event) => {
        if (!isMouseDownRef.current || captureInFlightRef.current) return;
        const x = Math.min(event.clientX, startRef.current.x);
        const y = Math.min(event.clientY, startRef.current.y);
        const w = Math.abs(event.clientX - startRef.current.x);
        const h = Math.abs(event.clientY - startRef.current.y);
        setSelection({ x, y, w, h });
      }}
      onMouseUp={finishSelection}
    >
      {isCaptureOverlayHidden ? null : selection ? (
        <>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-0 right-0 top-0 bg-black/38" style={{ height: selection.y }} />
            <div className="absolute left-0 bg-black/38" style={{ top: selection.y, width: selection.x, height: selection.h }} />
            <div className="absolute right-0 bg-black/38" style={{ top: selection.y, left: selection.x + selection.w, height: selection.h }} />
            <div className="absolute left-0 right-0 bottom-0 bg-black/38" style={{ top: selection.y + selection.h }} />
          </div>
          <div
            className="absolute pointer-events-none rounded-[4px] border-2 border-emerald-400 shadow-[0_0_0_1px_rgba(255,255,255,0.7)]"
            style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
          >
            <div className="absolute inset-0 bg-white/10" />
            <div className="absolute -top-7 right-0 rounded-md bg-emerald-500/95 px-2 py-1 text-[10px] font-semibold text-white shadow-lg whitespace-nowrap">
              {Math.max(0, Math.round(selection.w))} x {Math.max(0, Math.round(selection.h))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-black/38 pointer-events-none" />
          <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-[12px] font-medium text-white shadow-lg pointer-events-none backdrop-blur-sm">
            Drag to capture, Esc to cancel
          </div>
        </>
      )}
    </div>
  );
}

function MainApp() {
  const isMainDrawerWindow = (appWindow as any).label !== 'edge';
  const shouldShowInitialLaunchIntro = () => isMainDrawerWindow && !isLaunchIntroDoneThisPage();

  const [items, setItems] = useState<BufferItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<DrawerTabType>('all');
  const itemsRef = useRef<BufferItem[]>([]);
  const foldersRef = useRef<Folder[]>([]);
  const activeFolderIdStateRef = useRef<string>('all');
  const activeTabRef = useRef<DrawerTabType>('all');
  const drawerUndoStackRef = useRef<DrawerUndoSnapshot[]>([]);
  const drawerUndoRestoringRef = useRef(false);
  const canvasUndoStackRef = useRef<CanvasUndoSnapshot[]>([]);
  const canvasUndoRestoringRef = useRef(false);
  const drawerItemsSaveTimerRef = useRef<number | null>(null);
  const floatingBridgeSeenRef = useRef<Record<string, number>>({});
  const drawerTextEditUndoIdsRef = useRef<Set<string>>(new Set());
  const floatingTextUndoTimersRef = useRef<Record<string, number>>({});
  const blankFloatingNoteCreateLockRef = useRef(false);
  const lastBlankFloatingNoteCreatedAtRef = useRef(0);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { foldersRef.current = folders; }, [folders]);
  useEffect(() => { activeFolderIdStateRef.current = activeFolderId; }, [activeFolderId]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  const [isCanvasMode, setIsCanvasMode] = useState(false);
  const [canvasItems, setCanvasItems] = useState<CanvasImageItem[]>([]);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: CANVAS_BASE_WIDTH, height: CANVAS_BASE_HEIGHT });
  const [isCanvasSpacePressed, setIsCanvasSpacePressed] = useState(false);
  const [isCanvasChromeHidden, setIsCanvasChromeHidden] = useState(false);
  const [isCanvasNavigatorVisible, setIsCanvasNavigatorVisible] = useState(() => localStorage.getItem('drawer_canvas_navigator_visible') !== 'false');
  const [isCanvasGeneratedListVisible, setIsCanvasGeneratedListVisible] = useState(() => localStorage.getItem('drawer_canvas_generated_list_visible') !== 'false');
  const [showCanvasExitPrompt, setShowCanvasExitPrompt] = useState(false);
  const [canvasExitPromptStep, setCanvasExitPromptStep] = useState<'choice' | 'save'>('choice');
  const [canvasSelectedIds, setCanvasSelectedIds] = useState<string[]>([]);
  const [canvasSelectionBox, setCanvasSelectionBox] = useState<CanvasSelectionBox | null>(null);
  const [canvasFolderImportPrompt, setCanvasFolderImportPrompt] = useState<CanvasFolderImagePickerState | null>(null);
  const [canvasConnectionDraft, setCanvasConnectionDraft] = useState<{ fromId: string; sourceIds: string[]; fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const [canvasInputActionDraft, setCanvasInputActionDraft] = useState<{ targetId: string; fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const [isCanvasInteracting, setIsCanvasInteracting] = useState(false);
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuState | null>(null);
  const [canvasInputMenuForId, setCanvasInputMenuForId] = useState<string | null>(null);
  const [canvasAiPromptEditingId, setCanvasAiPromptEditingId] = useState<string | null>(null);
  const [canvasInputPickTargetId, setCanvasInputPickTargetId] = useState<string | null>(null);
  const canvasContextMenuRef = useRef<CanvasContextMenuState | null>(null);
  const canvasInputPickTargetIdRef = useRef<string | null>(null);
  const [isCanvasAiPanelOpen, setIsCanvasAiPanelOpen] = useState(false);
  const [canvasAiProvider, setCanvasAiProvider] = useState<CanvasAiProvider>(() => getStoredCanvasAiProvider());
  const [canvasAiApiKey, setCanvasAiApiKey] = useState(() => getStoredCanvasAiApiKey(getStoredCanvasAiProvider()));
  const [canvasAiEndpoint, setCanvasAiEndpoint] = useState(() => getStoredCanvasAiEndpoint(getStoredCanvasAiProvider()));
  const [canvasAiOpenAiModels, setCanvasAiOpenAiModels] = useState<string[]>(() => readStoredCanvasAiOpenAiModels());
  const [canvasAiXaisModels, setCanvasAiXaisModels] = useState<string[]>(() => readStoredCanvasAiXaisModels());
  const [isRefreshingCanvasAiOpenAiModels, setIsRefreshingCanvasAiOpenAiModels] = useState(false);
  const [canvasAiOpenAiModelError, setCanvasAiOpenAiModelError] = useState('');
  const [customCanvasAiPromptPresets, setCustomCanvasAiPromptPresets] = useState<CanvasAiPromptPreset[]>(() => readCustomCanvasAiPromptPresets());
  const [customCanvasWorkflows, setCustomCanvasWorkflows] = useState<CanvasWorkflowTemplate[]>(() => readCustomCanvasWorkflows());
  const [canvasWorkflowSaveDraft, setCanvasWorkflowSaveDraft] = useState<CanvasWorkflowSaveDraft | null>(null);
  const [isCanvasWorkflowManagerOpen, setIsCanvasWorkflowManagerOpen] = useState(false);
  const [canvasWorkflowEditingId, setCanvasWorkflowEditingId] = useState('');
  const [canvasWorkflowNameDraft, setCanvasWorkflowNameDraft] = useState('');
  const [canvasWorkflowHintDraft, setCanvasWorkflowHintDraft] = useState('');
  const [isCanvasPresetEditorOpen, setIsCanvasPresetEditorOpen] = useState(false);
  const [canvasPresetEditorMode, setCanvasPresetEditorMode] = useState<'create' | 'manage'>('create');
  const [canvasPresetEditingId, setCanvasPresetEditingId] = useState('');
  const [canvasPresetNameDraft, setCanvasPresetNameDraft] = useState('');
  const [canvasPresetPromptDraft, setCanvasPresetPromptDraft] = useState('');
  const [canvasWorkflowSingleEditGroupIds, setCanvasWorkflowSingleEditGroupIds] = useState<string[]>([]);
  const isCanvasModeRef = useRef(false);
  const canvasItemsRef = useRef<CanvasImageItem[]>([]);
  const canvasSelectedIdsRef = useRef<string[]>([]);
  const canvasWorkflowSingleEditGroupIdsRef = useRef<Set<string>>(new Set());
  const canvasScaleRef = useRef(1);
  const canvasSizeRef = useRef({ width: CANVAS_BASE_WIDTH, height: CANVAS_BASE_HEIGHT });
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasSizerRef = useRef<HTMLDivElement | null>(null);
  const canvasContentRef = useRef<HTMLDivElement | null>(null);
  const canvasItemsCommitFrameRef = useRef<number | null>(null);
  const pendingCanvasItemsCommitRef = useRef<CanvasImageItem[] | null>(null);
  const canvasAiRunTokensRef = useRef<Record<string, string>>({});
  const canvasAiModelRefreshSignatureRef = useRef('');
  const canvasScaleCommitTimerRef = useRef<number | null>(null);
  const canvasRunButtonPointerRef = useRef<{ targetId: string; at: number } | null>(null);
  const canvasInteractionTimerRef = useRef<number | null>(null);
  const isCanvasInteractingRef = useRef(false);
  const isCanvasPointerInsideRef = useRef(false);
  const lastCanvasDragClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastCanvasDropAtRef = useRef(0);
  const lastCanvasDroppedPathsKeyRef = useRef('');
  const mainDrawerLongPressTimerRef = useRef<number | null>(null);
  const mainDrawerLongPressTriggeredRef = useRef(false);
  const canvasDragRef = useRef<{
    ids: string[];
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    startScrollTop: number;
    startItems: Record<string, CanvasItemBox>;
    hasMoved: boolean;
  } | null>(null);
  const canvasResizeRef = useRef<{
    id: string;
    corner: CanvasResizeCorner;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    aspect: number;
    hasResized: boolean;
  } | null>(null);
  const canvasGroupResizeRef = useRef<{
    corner: CanvasResizeCorner;
    startClientX: number;
    startClientY: number;
    startBounds: CanvasItemBox;
    startItems: Record<string, CanvasItemBox>;
    aspect: number;
    hasResized: boolean;
  } | null>(null);
  const canvasSelectionDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    additive: boolean;
    baseSelectedIds: string[];
  } | null>(null);
  const canvasConnectionDragRef = useRef<{
    fromId: string;
    sourceIds: string[];
    pointerId: number;
    fromX: number;
    fromY: number;
  } | null>(null);
  const canvasInputActionDragRef = useRef<{
    targetId: string;
    pointerId: number;
    fromX: number;
    fromY: number;
  } | null>(null);
  const canvasUploadInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCanvasUploadTargetIdRef = useRef<string | null>(null);
  const canvasClipboardRef = useRef<CanvasImageItem[]>([]);
  const canvasPanRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const canvasScrollLockRef = useRef<{ left: number; top: number } | null>(null);
  const canvasScrollWriteGuardRef = useRef(false);
  const canvasScrollWriteFrameRef = useRef<number | null>(null);
  const isCanvasSpacePressedRef = useRef(false);
  const canvasSpaceKeyCapturedRef = useRef(false);
  const keepCanvasSessionOnLeaveRef = useRef(false);
  const canvasReturnScrollRef = useRef<{ left: number; top: number } | null>(null);
  const canvasStateLoadedRef = useRef(false);
  const canvasPersistSaveTimerRef = useRef<number | null>(null);
  const pendingCanvasFocusItemIdRef = useRef<string | null>(null);
  const setCanvasInteractionActive = (active: boolean, releaseDelay = 120) => {
    if (canvasInteractionTimerRef.current !== null) {
      window.clearTimeout(canvasInteractionTimerRef.current);
      canvasInteractionTimerRef.current = null;
    }

    if (active) {
      if (!isCanvasInteractingRef.current) {
        isCanvasInteractingRef.current = true;
        setIsCanvasInteracting(true);
      }
      return;
    }

    canvasInteractionTimerRef.current = window.setTimeout(() => {
      canvasInteractionTimerRef.current = null;
      if (!isCanvasInteractingRef.current) return;
      isCanvasInteractingRef.current = false;
      setIsCanvasInteracting(false);
    }, releaseDelay);
  };

  useEffect(() => {
    isCanvasModeRef.current = isCanvasMode;
    if (!isCanvasMode) {
      const keepCanvasSession = keepCanvasSessionOnLeaveRef.current;
      isCanvasPointerInsideRef.current = false;
      if (!keepCanvasSession) {
        canvasUndoStackRef.current = [];
        canvasUndoRestoringRef.current = false;
      }
      setIsCanvasSpacePressed(false);
      setCanvasSelectedIds([]);
      setCanvasSelectionBox(null);
      setCanvasFolderImportPrompt(null);
      setCanvasConnectionDraft(null);
      setCanvasInputActionDraft(null);
      setCanvasInteractionActive(false, 0);
      setCanvasContextMenu(null);
      setCanvasInputMenuForId(null);
      setCanvasInputPickTargetId(null);
      setIsCanvasAiPanelOpen(false);
      setIsCanvasChromeHidden(false);
      canvasPanRef.current = null;
      canvasDragRef.current = null;
      canvasResizeRef.current = null;
      canvasGroupResizeRef.current = null;
      canvasSelectionDragRef.current = null;
      canvasConnectionDragRef.current = null;
      canvasInputActionDragRef.current = null;
      canvasScrollLockRef.current = null;
      canvasSpaceKeyCapturedRef.current = false;
      keepCanvasSessionOnLeaveRef.current = false;
    }
  }, [isCanvasMode]);
  useEffect(() => { canvasItemsRef.current = canvasItems; }, [canvasItems]);
  useEffect(() => { canvasSelectedIdsRef.current = canvasSelectedIds; }, [canvasSelectedIds]);
  useEffect(() => {
    if (canvasScaleCommitTimerRef.current !== null && Math.abs((canvasScaleRef.current || 1) - canvasScale) > 0.001) {
      return;
    }
    canvasScaleRef.current = canvasScale;
  }, [canvasScale]);
  useEffect(() => { canvasSizeRef.current = canvasSize; }, [canvasSize]);
  useEffect(() => { canvasContextMenuRef.current = canvasContextMenu; }, [canvasContextMenu]);
  useEffect(() => {
    if (!isCanvasMode) return;
    const closeCanvasClickWindows = () => {
      setCanvasContextMenu(null);
      setCanvasInputMenuForId(null);
      setCanvasFolderImportPrompt(null);
      setIsCanvasAiPanelOpen(false);
      setIsCanvasPresetEditorOpen(false);
      setIsCanvasWorkflowManagerOpen(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-canvas-floating-layer="true"]')) return;
      closeCanvasClickWindows();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCanvasClickWindows();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isCanvasMode]);
  useEffect(() => { canvasInputPickTargetIdRef.current = canvasInputPickTargetId; }, [canvasInputPickTargetId]);
  useEffect(() => { isCanvasSpacePressedRef.current = isCanvasSpacePressed; }, [isCanvasSpacePressed]);
  useEffect(() => { localStorage.setItem('drawer_canvas_navigator_visible', isCanvasNavigatorVisible ? 'true' : 'false'); }, [isCanvasNavigatorVisible]);
  useEffect(() => { localStorage.setItem('drawer_canvas_generated_list_visible', isCanvasGeneratedListVisible ? 'true' : 'false'); }, [isCanvasGeneratedListVisible]);
  useEffect(() => {
    localStorage.setItem(CANVAS_AI_PROVIDER_STORAGE_KEY, canvasAiProvider);
    localStorage.setItem(CANVAS_AI_PROVIDER_DEFAULT_VERSION_STORAGE_KEY, CANVAS_AI_PROVIDER_DEFAULT_VERSION);
  }, [canvasAiProvider]);
  useEffect(() => {
    localStorage.setItem(getCanvasAiApiKeyStorageKey(canvasAiProvider), canvasAiApiKey);
    if (canvasAiProvider === 'aoduo-ai') {
      localStorage.setItem(CANVAS_AI_API_KEY_STORAGE_KEY, canvasAiApiKey);
    }
  }, [canvasAiApiKey, canvasAiProvider]);
  useEffect(() => {
    localStorage.setItem(getCanvasAiEndpointStorageKey(canvasAiProvider), canvasAiEndpoint);
    localStorage.setItem(CANVAS_AI_ENDPOINT_STORAGE_KEY, canvasAiEndpoint);
  }, [canvasAiEndpoint, canvasAiProvider]);
  useEffect(() => {
    localStorage.setItem(CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY, JSON.stringify(customCanvasAiPromptPresets));
  }, [customCanvasAiPromptPresets]);
  useEffect(() => {
    localStorage.setItem(CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY, JSON.stringify(customCanvasWorkflows));
  }, [customCanvasWorkflows]);
  useEffect(() => {
    canvasWorkflowSingleEditGroupIdsRef.current = new Set(canvasWorkflowSingleEditGroupIds);
  }, [canvasWorkflowSingleEditGroupIds]);
  useLayoutEffect(() => {
    if (!isCanvasMode) return;
    applyCanvasScaleStyles(canvasScaleRef.current, canvasSizeRef.current);
  }, [isCanvasMode, canvasScale, canvasSize]);
  useEffect(() => () => {
    flushCanvasItemsInFrame();
    if (canvasScaleCommitTimerRef.current !== null) {
      window.clearTimeout(canvasScaleCommitTimerRef.current);
      canvasScaleCommitTimerRef.current = null;
    }
    if (canvasInteractionTimerRef.current !== null) {
      window.clearTimeout(canvasInteractionTimerRef.current);
      canvasInteractionTimerRef.current = null;
    }
  }, []);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfLocalDay(Date.now()));
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => startOfLocalDay(Date.now()));
  const [calendarTagFilter, setCalendarTagFilter] = useState('all');
  const [calendarDraftText, setCalendarDraftText] = useState('');
  const [calendarDraftPriority, setCalendarDraftPriority] = useState<SchedulePriority>('B');
  const [calendarTargetNoteLabel, setCalendarTargetNoteLabel] = useState(CALENDAR_NEW_NOTE_TARGET);
  const [selectedAlchemyItemId, setSelectedAlchemyItemId] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(shouldShowInitialLaunchIntro);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [triggerMode, setTriggerMode] = useState<TriggerMode>(() => getStoredTriggerMode());
  const triggerModeRef = useRef<TriggerMode>(triggerMode);
  useEffect(() => { triggerModeRef.current = triggerMode; }, [triggerMode]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const selectedImageReturnToCanvasRef = useRef(false);
  const [selectedVideo, setSelectedVideo] = useState<{url: string, path: string} | null>(null);
  const [selectedImageZoom, setSelectedImageZoom] = useState(1);
  const [selectedImagePan, setSelectedImagePan] = useState({ x: 0, y: 0 });
  const selectedImagePanRef = useRef(selectedImagePan);
  useEffect(() => { selectedImagePanRef.current = selectedImagePan; }, [selectedImagePan]);
  const [showSelectedImageZoom, setShowSelectedImageZoom] = useState(false);
  const selectedImageZoomTimerRef = useRef<any | null>(null);
  const previewDragActiveRef = useRef(false);
  const lastNativeDropAtRef = useRef(0);
  const lastDroppedPathsKeyRef = useRef('');
  const lastWebImageUrlRef = useRef('');
  const lastWebImageDropAtRef = useRef(0);
  const [isShortcutReveal, setIsShortcutReveal] = useState(false);
  const shortcutRevealTimerRef = useRef<any | null>(null);

  const markShortcutReveal = () => {
    if (shortcutRevealTimerRef.current) clearTimeout(shortcutRevealTimerRef.current);
    setIsShortcutReveal(true);
    shortcutRevealTimerRef.current = setTimeout(() => {
      shortcutRevealTimerRef.current = null;
      setIsShortcutReveal(false);
    }, 420);
  };

  useEffect(() => () => {
    if (shortcutRevealTimerRef.current) clearTimeout(shortcutRevealTimerRef.current);
    Object.values(floatingTextUndoTimersRef.current).forEach(timer => window.clearTimeout(timer));
    floatingTextUndoTimersRef.current = {};
  }, []);

  useEffect(() => {
    if (selectedImageZoomTimerRef.current) {
      clearTimeout(selectedImageZoomTimerRef.current);
      selectedImageZoomTimerRef.current = null;
    }

    if (selectedImage) {
      setSelectedImageZoom(1);
      setSelectedImagePan({ x: 0, y: 0 });
      selectedImagePanRef.current = { x: 0, y: 0 };
      setShowSelectedImageZoom(false);
    }
  }, [selectedImage]);

  const [isPinned, setIsPinned] = useState(false);
  const closeTimerRef = useRef<any | null>(null);
  const idleAutoCloseTimerRef = useRef<any | null>(null);
  const startupAutoCloseTimerRef = useRef<any | null>(null);
  const startupAutoCloseSuppressedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const enforceAntiTouchClosed = (showFeedback = false) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (idleAutoCloseTimerRef.current) {
      clearTimeout(idleAutoCloseTimerRef.current);
      idleAutoCloseTimerRef.current = null;
    }

    startupAutoCloseSuppressedRef.current = false;
    isPointerInsideDrawerRef.current = false;
    isPinnedRef.current = false;
    setIsOpen(false);
    setIsPinned(false);
    setDrawerState('closed');
    setShowTextInput(false);
    setIsSearchActive(false);
    setShowSettings(false);
    setShowFolderModal(false);
    setShowMoveFolderModal(false);
    setSelectedImage(null);
    setSelectedVideo(null);
    invoke('set_anti_touch_lock', { locked: true }).catch(() => {});
    invoke('toggle_pin', { pinned: false }).catch(() => {});
    invoke('close_drawer', { mode: triggerModeRef.current }).finally(() => {
      invoke('hide_edge').catch(() => {});
    });
    if (showFeedback) showToast('防误触已开启，抽屉保持锁定');
  };

  // 🌟 放在其他 useState 旁边
  const [isDraggingTitle, setIsDraggingTitle] = useState(false);
  const isDraggingTitleRef = useRef(false);
  useEffect(() => { isDraggingTitleRef.current = isDraggingTitle; }, [isDraggingTitle]);

  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  useEffect(() => { localStorage.setItem('theme', isDark ? 'dark' : 'light'); }, [isDark]);

  const [cardWidth, setCardWidth] = useState(() => Number(localStorage.getItem('drawer_card_width')) || 320);
  useEffect(() => { localStorage.setItem('drawer_card_width', cardWidth.toString()); }, [cardWidth]);

  const [cardMediaHeight, setCardMediaHeight] = useState(() => Number(localStorage.getItem('drawer_media_height')) || 180);
  useEffect(() => { localStorage.setItem('drawer_media_height', cardMediaHeight.toString()); }, [cardMediaHeight]);

  const [folderRailHeight, setFolderRailHeight] = useState(() => Number(localStorage.getItem('drawer_folder_rail_height')) || 386);
  useEffect(() => {
    localStorage.setItem('drawer_folder_rail_height', String(Math.round(folderRailHeight)));
  }, [folderRailHeight]);

  const [isResizingCards, setIsResizingCards] = useState(false);
  const [drawerRenderLimit, setDrawerRenderLimit] = useState(DRAWER_INITIAL_RENDER_LIMIT);
  const drawerScrollRef = useRef<HTMLDivElement | null>(null);
  const [isAntiTouchMode, setIsAntiTouchMode] = useState(() => localStorage.getItem('drawer_anti_touch_mode') === 'true');
  useEffect(() => {
    invoke('set_anti_touch_lock', { locked: isAntiTouchMode }).catch(() => {});
    if (isAntiTouchMode && !showLaunchIntroRef.current && !isSplashVisibleRef.current && !showUpdateLogRef.current) {
      enforceAntiTouchClosed(false);
    }
  }, [isAntiTouchMode]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [showLaunchIntro, setShowLaunchIntro] = useState(shouldShowInitialLaunchIntro);
  const showLaunchIntroRef = useRef(showLaunchIntro);
  useEffect(() => { showLaunchIntroRef.current = showLaunchIntro; }, [showLaunchIntro]);
  const [showUpdateLog, setShowUpdateLog] = useState(false);
  const showUpdateLogRef = useRef(showUpdateLog);
  useEffect(() => { showUpdateLogRef.current = showUpdateLog; }, [showUpdateLog]);
  const [isCloudflaredDisclaimerAccepted, setIsCloudflaredDisclaimerAccepted] = useState(() => (
    localStorage.getItem(CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY) === 'true'
  ));
  const [isSplashVisible, setIsSplashVisible] = useState(showLaunchIntro);
  const isSplashVisibleRef = useRef(isSplashVisible);
  useEffect(() => { isSplashVisibleRef.current = isSplashVisible; }, [isSplashVisible]);

  const acceptCloudflaredDisclaimer = () => {
    localStorage.setItem(CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY, 'true');
    setIsCloudflaredDisclaimerAccepted(true);
  };

  const declineCloudflaredDisclaimer = () => {
    localStorage.setItem(CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY, 'false');
    setIsCloudflaredDisclaimerAccepted(false);
  };

  const closeUpdateLog = () => {
    setShowUpdateLog(false);
    showUpdateLogRef.current = false;
    localStorage.setItem('drawer_v3_update_shown', 'true');
  };

  const acceptUpdateLogAndClose = () => {
    acceptCloudflaredDisclaimer();
    closeUpdateLog();
  };

  const [toast, setToast] = useState({ show: false, msg: '' });
  const toastTimerRef = useRef<any | null>(null);
  const [isMobileConnected, setIsMobileConnected] = useState(false);
  const disconnectTimerRef = useRef<any | null>(null);
  const recentMobilePayloadsRef = useRef<Record<string, number>>({});

  const resetDisconnectTimer = () => {
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    disconnectTimerRef.current = setTimeout(() => setIsMobileConnected(false), 30000);
  };

  const showToast = (msg: string) => {
    setToast({ show: true, msg });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast({ show: false, msg: '' }), 2500);
  };

  const takeDrawerUndoSnapshot = (label: string): DrawerUndoSnapshot => {
    const openFloatingNoteLabels = readOpenFloatingNoteLabels();
    return {
      items: cloneDrawerValue(itemsRef.current.map(stripHeavyDataThumbnail)),
      folders: cloneDrawerValue(foldersRef.current),
      activeFolderId: activeFolderIdStateRef.current,
      activeTab: activeTabRef.current,
      openFloatingNoteLabels: cloneDrawerValue(openFloatingNoteLabels),
      floatingNotes: openFloatingNoteLabels
        .map(noteLabel => {
          const snapshot = readFloatingNoteSnapshot(noteLabel);
          return snapshot ? { label: noteLabel, snapshot: cloneDrawerValue(compactFloatingNoteSnapshot(snapshot)) } : null;
        })
        .filter((entry): entry is { label: string; snapshot: FloatingNoteSnapshot } => !!entry),
      label,
      createdAt: Date.now(),
    };
  };

  const pushDrawerUndoSnapshot = (label: string) => {
    if (drawerUndoRestoringRef.current) return;
    drawerUndoStackRef.current = [
      ...drawerUndoStackRef.current,
      takeDrawerUndoSnapshot(label),
    ].slice(-DRAWER_UNDO_LIMIT);
  };

  const beginDrawerTextEditUndo = (itemId: string) => {
    if (!itemId || drawerTextEditUndoIdsRef.current.has(itemId)) return;
    pushDrawerUndoSnapshot('修改文本');
    drawerTextEditUndoIdsRef.current.add(itemId);
  };

  const endDrawerTextEditUndo = (itemId: string) => {
    if (!itemId) return;
    drawerTextEditUndoIdsRef.current.delete(itemId);
  };

  const beginFloatingTextUndo = (itemId: string, label: string) => {
    if (!itemId) return;
    if (!drawerTextEditUndoIdsRef.current.has(itemId)) {
      pushDrawerUndoSnapshot(label);
      drawerTextEditUndoIdsRef.current.add(itemId);
    }
    const timers = floatingTextUndoTimersRef.current;
    if (timers[itemId]) window.clearTimeout(timers[itemId]);
    timers[itemId] = window.setTimeout(() => {
      delete timers[itemId];
      drawerTextEditUndoIdsRef.current.delete(itemId);
    }, 900);
  };

  const restoreDrawerUndoSnapshot = (snapshot: DrawerUndoSnapshot) => {
    drawerUndoRestoringRef.current = true;
    const snapshotLabels = new Set(snapshot.openFloatingNoteLabels);
    readOpenFloatingNoteLabels().forEach(label => {
      if (!snapshotLabels.has(label)) {
        deleteFloatingNoteSnapshot(label);
        void invoke('hide_note_window', { label }).catch(() => {});
      }
    });
    snapshot.floatingNotes.forEach(entry => {
      localStorage.setItem(floatingNoteStorageKey(entry.label), JSON.stringify(entry.snapshot));
      void emitFloatingNoteUpdated(entry.label, entry.snapshot).catch(() => {});
    });
    writeOpenFloatingNoteLabels(snapshot.openFloatingNoteLabels);
    setItems(cloneDrawerValue(snapshot.items));
    setFolders(cloneDrawerValue(snapshot.folders));
    setActiveFolderId(snapshot.activeFolderId);
    setActiveTab(snapshot.activeTab);
    setSelectedIds([]);
    setIsSelectMode(false);
    setShowMoveFolderModal(false);
    drawerTextEditUndoIdsRef.current.clear();
    Object.values(floatingTextUndoTimersRef.current).forEach(timer => window.clearTimeout(timer));
    floatingTextUndoTimersRef.current = {};
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    lastSelectedDrawerItemIdRef.current = null;
    refreshNoteManager();
    window.setTimeout(() => {
      drawerUndoRestoringRef.current = false;
    }, 0);
  };

  const undoLastDrawerChange = () => {
    const snapshot = drawerUndoStackRef.current.pop();
    if (!snapshot) {
      showToast('没有可撤回的操作');
      return;
    }
    restoreDrawerUndoSnapshot(snapshot);
    showToast(`已撤回：${snapshot.label}`);
  };

  const [calendarNotificationsEnabled, setCalendarNotificationsEnabled] = useState(
    () => localStorage.getItem(CALENDAR_NOTIFICATIONS_ENABLED_STORAGE_KEY) === 'true',
  );

  useEffect(() => {
    localStorage.setItem(CALENDAR_NOTIFICATIONS_ENABLED_STORAGE_KEY, String(calendarNotificationsEnabled));
  }, [calendarNotificationsEnabled]);

  const [noteManagerVersion, setNoteManagerVersion] = useState(0);
  const [quickRailMode, setQuickRailMode] = useState<'quick' | 'notes'>('quick');
  const [isCreatingBlankNote, setIsCreatingBlankNote] = useState(false);
  const refreshNoteManager = () => setNoteManagerVersion(version => version + 1);

  useEffect(() => {
    const seenItemIds = new Set<string>();
    const cleanLabels: string[] = [];
    readOpenFloatingNoteLabels().forEach(label => {
      const snapshot = readFloatingNoteSnapshot(label);
      if (!snapshot?.itemId) return;
      if (seenItemIds.has(snapshot.itemId)) {
        localStorage.removeItem(floatingNoteStorageKey(label));
        void invoke('hide_note_window', { label }).catch(() => {});
        return;
      }
      seenItemIds.add(snapshot.itemId);
      cleanLabels.push(label);
    });
    writeOpenFloatingNoteLabels(cleanLabels);
  }, []);

  const openFloatingNoteEntries = useMemo(() => (
    readOpenFloatingNoteLabels()
      .map(label => ({ label, snapshot: readFloatingNoteSnapshot(label) }))
      .filter(entry => !!entry.snapshot)
  ), [noteManagerVersion, items]);

  const openFloatingNoteCount = openFloatingNoteEntries.length;

  const applyFloatingNoteDestroy = (rawPayload: any) => {
    const payload = rawPayload || {};
    const itemId = typeof payload.itemId === 'string' ? payload.itemId : '';
    const label = typeof payload.label === 'string' ? payload.label : '';
    if (itemId) {
      pushDrawerUndoSnapshot('删除便签卡片');
      setItems(prev => prev.filter(item => item.id !== itemId));
    }
    if (label) {
      deleteFloatingNoteSnapshot(label);
      invoke('hide_note_window', { label }).catch(() => {});
    }
    refreshNoteManager();
  };

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === FLOATING_NOTE_DESTROY_BRIDGE_KEY && event.newValue) {
        try {
          applyFloatingNoteDestroy(JSON.parse(event.newValue));
        } catch (_) {}
        return;
      }

      if (
        event.key === OPEN_FLOATING_NOTES_STORAGE_KEY ||
        event.key === FLOATING_NOTE_TEXT_BRIDGE_KEY ||
        event.key === FLOATING_NOTE_TITLE_BRIDGE_KEY ||
        event.key === FLOATING_NOTE_SOURCE_BRIDGE_KEY ||
        event.key === FLOATING_NOTE_DESTROY_BRIDGE_KEY ||
        (typeof event.key === 'string' && event.key.startsWith('drawer_floating_note_'))
      ) {
        refreshNoteManager();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const focusFloatingNote = async (label: string, snapshot?: FloatingNoteSnapshot | null) => {
    try {
      const note = snapshot || readFloatingNoteSnapshot(label);
      if (!note) {
        showToast('这个便签内容已丢失');
        refreshNoteManager();
        return;
      }

      const view = readFloatingNoteViewState(note.itemId);
      rememberOpenFloatingNoteLabel(label);
      await invoke('show_note_window', {
        label,
        width: Number((note as any).width ?? view.width ?? (note.type === 'text' ? TEXT_FLOATING_NOTE_SIZES.large.width : 360)),
        height: Number((note as any).height ?? view.height ?? (note.type === 'text' ? TEXT_FLOATING_NOTE_SIZES.large.height : 340)),
        topmost: !!note.topmost,
      });
      await emitFloatingNoteUpdated(label, note).catch(() => {});
      refreshNoteManager();
    } catch (err) {
      console.error('显示便签失败:', err);
      showToast('显示便签失败');
    }
  };

  const closeFloatingNoteByLabel = async (label: string) => {
    try {
      pushDrawerUndoSnapshot('删除便签');
      deleteFloatingNoteSnapshot(label);
      await invoke('hide_note_window', { label }).catch(() => {});
      refreshNoteManager();
      showToast('已删除便签');
    } catch (err) {
      console.error('删除便签失败:', err);
      showToast('删除便签失败');
    }
  };

  const closeAllFloatingNotes = async () => {
    const labels = readOpenFloatingNoteLabels();
    if (labels.length > 0) pushDrawerUndoSnapshot('删除全部便签');
    labels.forEach(label => deleteFloatingNoteSnapshot(label));
    await Promise.all(labels.map(label => invoke('hide_note_window', { label }).catch(() => {})));
    refreshNoteManager();
    showToast(labels.length > 0 ? '已删除全部便签' : '当前没有保存的便签');
  };

  const createFloatingNote = async (
    item: BufferItem,
    options: { topmost?: boolean; x?: number; y?: number; width?: number; height?: number; silent?: boolean } = {},
  ) => {
    let pendingNoteLabel = '';
    const lockKey = `${FLOATING_NOTE_CREATE_LOCK_STORAGE_PREFIX}${localLockKeyPart(item.id || item.path || item.url || item.name || 'unknown')}`;
    const lockOwner = acquireTimedLocalLock(lockKey, 1600);
    if (!lockOwner) return null;
    try {
      const existingEntry = readOpenFloatingNoteLabels()
        .map(label => ({ label, snapshot: readFloatingNoteSnapshot(label) }))
        .find(entry => entry.snapshot?.itemId === item.id);
      if (existingEntry?.snapshot) {
        await focusFloatingNote(existingEntry.label, existingEntry.snapshot);
        return { noteLabel: existingEntry.label, snapshot: existingEntry.snapshot };
      }

      const openLabels = readOpenFloatingNoteLabels();
      const noteLabel = FLOATING_NOTE_LABELS.find(label => !openLabels.includes(label));
      if (!noteLabel) {
        showToast(`最多同时保存 ${MAX_FLOATING_NOTE_COUNT} 个桌面便签，请先在抽屉侧栏删除一个`);
        return;
      }
      pendingNoteLabel = noteLabel;
      const view = readFloatingNoteViewState(item.id);
      const imageSize = item.type === 'image'
        ? (options.width && options.height
          ? { width: options.width, height: options.height }
          : fitImageFloatingNoteSize(await readImageAspect(item)))
        : null;
      const defaultWidth = item.type === 'text'
        ? TEXT_FLOATING_NOTE_SIZES.large.width
        : (imageSize?.width || 360);
      const defaultHeight = item.type === 'text'
        ? TEXT_FLOATING_NOTE_SIZES.large.height
        : (imageSize?.height || 340);
      const snapshot = {
        ...makeFloatingNoteSnapshot(item),
        id: `${noteLabel}_${item.id}_${Date.now()}`,
        zoom: item.type === 'image' ? 1 : Number(view.zoom ?? 1),
        width: Number(options.width ?? (item.type === 'image' ? (view.width ?? defaultWidth) : (view.width ?? defaultWidth))),
        height: Number(options.height ?? (item.type === 'image' ? (view.height ?? defaultHeight) : (view.height ?? defaultHeight))),
        topmost: !!options.topmost,
      };

      localStorage.setItem(floatingNoteStorageKey(noteLabel), JSON.stringify(snapshot));
      rememberOpenFloatingNoteLabel(noteLabel);

      void emitFloatingNoteUpdated(noteLabel, snapshot).catch(() => {});
      await invoke('show_note_window', {
        label: noteLabel,
        width: snapshot.width,
        height: snapshot.height,
        x: options.x,
        y: options.y,
        topmost: options.topmost,
      });
      await emitFloatingNoteUpdated(noteLabel, snapshot).catch(() => {});
      refreshNoteManager();
      if (!options.silent) showToast('已打开桌面便签');
      return { noteLabel, snapshot: snapshot as FloatingNoteSnapshot };
    } catch (err) {
      console.error('打开桌面便签失败:', err);
      if (pendingNoteLabel) {
        deleteFloatingNoteSnapshot(pendingNoteLabel);
        await invoke('hide_note_window', { label: pendingNoteLabel }).catch(() => {});
      }
      refreshNoteManager();
      showToast('打开桌面便签失败');
      return null;
    } finally {
      window.setTimeout(() => {
        releaseTimedLocalLock(lockKey, lockOwner);
      }, 350);
    }
  };

  const createBlankFloatingNote = async () => {
    const now = Date.now();
    if (blankFloatingNoteCreateLockRef.current || now - lastBlankFloatingNoteCreatedAtRef.current < 700) return;
    const lockOwner = acquireTimedLocalLock(BLANK_NOTE_CREATE_LOCK_STORAGE_KEY, 1200);
    if (!lockOwner) return;
    blankFloatingNoteCreateLockRef.current = true;
    lastBlankFloatingNoteCreatedAtRef.current = now;
    setIsCreatingBlankNote(true);

    try {
      const item: BufferItem = {
        id: `blank_note_${now}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'text',
        content: '',
        name: '新便签',
        remark: '新便签',
        remarks: ['新便签'],
        createdAt: now,
        folderId: activeFolderId !== 'all' ? activeFolderId : undefined,
      };

      pushDrawerUndoSnapshot('新增便签');
      setItems(prev => [item, ...prev]);
      setQuickRailMode('notes');
      const created = await createFloatingNote(item);
      if (!created) {
        setItems(prev => prev.filter(existing => existing.id !== item.id));
      }
    } finally {
      window.setTimeout(() => {
        blankFloatingNoteCreateLockRef.current = false;
        setIsCreatingBlankNote(false);
        releaseTimedLocalLock(BLANK_NOTE_CREATE_LOCK_STORAGE_KEY, lockOwner);
      }, 250);
    }
  };

  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingCategory, setActiveSettingCategory] = useState<string>('appearance');
  const [showHelp, setShowHelp] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [localIP, setLocalIP] = useState('');
  const [mobilePairUrl, setMobilePairUrl] = useState('');
  const [isAutoStart, setIsAutoStart] = useState(false);
  const [isAutoStartChanging, setIsAutoStartChanging] = useState(false);

  const [shortcut, setShortcut] = useState('Alt+G');
  const [isRecording, setIsRecording] = useState(false);
  const [snipShortcut, setSnipShortcut] = useState('F1');
  const [isRecordingSnip, setIsRecordingSnip] = useState(false);
  const [textShortcut, setTextShortcut] = useState('Alt+T');
  const [isRecordingText, setIsRecordingText] = useState(false);
  const [searchShortcut, setSearchShortcut] = useState('Alt+S');
  const [isRecordingSearch, setIsRecordingSearch] = useState(false);
  const [triggerShortcut, setTriggerShortcut] = useState(() => localStorage.getItem('drawer_trigger_shortcut') || 'Alt+Q');
  const [isRecordingTrigger, setIsRecordingTrigger] = useState(false);
  const [noteShortcut, setNoteShortcut] = useState('Alt+E');
  const [isRecordingNote, setIsRecordingNote] = useState(false);
  const [canvasShortcut, setCanvasShortcut] = useState('Alt+`');
  const [isRecordingCanvas, setIsRecordingCanvas] = useState(false);

  const [showTextInput, setShowTextInput] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  const [aiApiProvider, setAiApiProvider] = useState(() => localStorage.getItem('drawer_ai_provider') || 'siliconflow');
  const [aiApiEndpoint, setAiApiEndpoint] = useState(() => localStorage.getItem('drawer_ai_endpoint') || SILICONFLOW_DEFAULT_ENDPOINT);
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('drawer_ai_key') || '');
  const [aiApiModel, setAiApiModel] = useState(() => localStorage.getItem('drawer_ai_model') || SILICONFLOW_DEFAULT_MODEL);
  const [siliconFlowVisionModels, setSiliconFlowVisionModels] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('drawer_siliconflow_vision_models') || '[]');
      return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
    } catch (_) {
      return [];
    }
  });
  const [isRefreshingSiliconFlowModels, setIsRefreshingSiliconFlowModels] = useState(false);
  const [siliconFlowModelListError, setSiliconFlowModelListError] = useState('');
  const [webImageCacheDir, setWebImageCacheDir] = useState(() => localStorage.getItem('drawer_web_image_cache_dir') || '');
  const webImageCacheDirRef = useRef(webImageCacheDir);
  useEffect(() => { webImageCacheDirRef.current = webImageCacheDir; }, [webImageCacheDir]);

  const getLatestFileCacheDir = async () => {
    const localValue = (
      webImageCacheDirRef.current ||
      localStorage.getItem('drawer_web_image_cache_dir') ||
      ''
    ).trim();
    if (localValue) return localValue;

    try {
      const dir = await invoke<string>('get_web_image_cache_dir');
      if (dir) {
        setWebImageCacheDir(dir);
        webImageCacheDirRef.current = dir;
        localStorage.setItem('drawer_web_image_cache_dir', dir);
        return dir;
      }
    } catch (_) {}

    return '';
  };
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const lastSelectedDrawerItemIdRef = useRef<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const draggingItemIdRef = useRef<string | null>(null);
  useEffect(() => { draggingItemIdRef.current = draggingItemId; }, [draggingItemId]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const closeConfirmDialog = () => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  };

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showMoveFolderModal, setShowMoveFolderModal] = useState(false);
  const [moveFolderName, setMoveFolderName] = useState('');

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [snipMode, setSnipMode] = useState<{ active: boolean; bg: string }>({ active: false, bg: '' });
  const [isSnipSessionActive, setIsSnipSessionActive] = useState(false);
  const snipModeActiveRef = useRef(false);
  const snipExitInFlightRef = useRef(false);
  const snipRestoreDrawerRef = useRef<{ isOpen: boolean; isPinned: boolean; isCanvasMode: boolean } | null>(null);
  useEffect(() => { snipModeActiveRef.current = snipMode.active || isSnipSessionActive; }, [snipMode.active, isSnipSessionActive]);
  const [selection, setSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const isMouseDown = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const stateRef = useRef({ isOpen, isPinned, showTextInput, isSearchActive, isAntiTouchMode });
  useEffect(() => {
    stateRef.current = { isOpen, isPinned, showTextInput, isSearchActive, isAntiTouchMode };
  }, [isOpen, isPinned, showTextInput, isSearchActive, isAntiTouchMode]);

  useEffect(() => {
    invoke('load_ai_analysis_config')
      .then((config: any) => {
        if (!config || typeof config !== 'object') return;
        const nextProvider = typeof config.provider === 'string' && config.provider ? config.provider : 'siliconflow';
        setAiApiProvider(nextProvider);
        if (typeof config.endpoint === 'string' && config.endpoint) {
          setAiApiEndpoint(config.endpoint);
        } else if (isSiliconFlowProvider(nextProvider)) {
          setAiApiEndpoint(SILICONFLOW_DEFAULT_ENDPOINT);
        }
        if (typeof config.apiKey === 'string' && config.apiKey) setAiApiKey(config.apiKey);
        if (typeof config.model === 'string' && config.model) {
          setAiApiModel(config.model);
        } else if (isSiliconFlowProvider(nextProvider)) {
          setAiApiModel(SILICONFLOW_DEFAULT_MODEL);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const storedDir = (localStorage.getItem('drawer_web_image_cache_dir') || '').trim();
    const request = storedDir
      ? invoke<string>('set_web_image_cache_dir', { dir: storedDir })
      : invoke<string>('get_web_image_cache_dir');

    request
      .then((dir) => {
        if (dir) {
          setWebImageCacheDir(dir);
          webImageCacheDirRef.current = dir;
          localStorage.setItem('drawer_web_image_cache_dir', dir);
        }
      })
      .catch(() => {});
  }, []);

  const chooseWebImageCacheDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择文件缓存文件夹',
      });
      if (typeof selected !== 'string') return;

      const savedDir = await invoke<string>('set_web_image_cache_dir', { dir: selected });
      setWebImageCacheDir(savedDir);
      webImageCacheDirRef.current = savedDir;
      localStorage.setItem('drawer_web_image_cache_dir', savedDir);
      showToast('文件缓存路径已更新');
    } catch (err) {
      console.error('设置文件缓存路径失败:', err);
      showToast('缓存路径设置失败');
    }
  };

  const resetWebImageCacheDir = async () => {
    try {
      const savedDir = await invoke<string>('set_web_image_cache_dir', { dir: '' });
      setWebImageCacheDir(savedDir);
      webImageCacheDirRef.current = savedDir;
      localStorage.setItem('drawer_web_image_cache_dir', savedDir);
      showToast('已恢复默认缓存路径');
    } catch (err) {
      console.error('恢复默认缓存路径失败:', err);
      showToast('恢复默认路径失败');
    }
  };

  useEffect(() => {
    const config: AiAnalysisConfig = {
      provider: aiApiProvider,
      endpoint: aiApiEndpoint.trim(),
      apiKey: aiApiKey.trim(),
      model: aiApiModel.trim(),
      proxy: '',
    };
    localStorage.setItem('drawer_ai_provider', config.provider);
    localStorage.setItem('drawer_ai_endpoint', config.endpoint);
    localStorage.setItem('drawer_ai_key', config.apiKey);
    localStorage.setItem('drawer_ai_model', config.model);
    invoke('save_ai_analysis_config', { config }).catch(() => {});
  }, [aiApiProvider, aiApiEndpoint, aiApiKey, aiApiModel]);

  const siliconFlowModelOptions = useMemo(() => {
    const merged = new Set<string>();
    siliconFlowVisionModels.forEach(model => { if (model && isSiliconFlowVisionModel(model)) merged.add(model); });
    SILICONFLOW_VISION_MODEL_FALLBACKS.forEach(model => merged.add(model.value));
    if (aiApiModel.trim()) merged.add(aiApiModel.trim());
    return Array.from(merged).map(value => ({
      value,
      label: SILICONFLOW_VISION_MODEL_LABELS[value] || value,
    }));
  }, [siliconFlowVisionModels, aiApiModel]);

  const refreshSiliconFlowVisionModels = async () => {
    if (!isSiliconFlowProvider(aiApiProvider)) return;
    if (!aiApiKey.trim()) {
      setSiliconFlowModelListError('请先填写硅基流动 API Key，再刷新模型列表。');
      showToast('请先填写硅基流动 API Key');
      return;
    }
    setIsRefreshingSiliconFlowModels(true);
    setSiliconFlowModelListError('');
    try {
      const models = await invoke<string[]>('get_siliconflow_vision_models', {
        endpoint: aiApiEndpoint.trim() || SILICONFLOW_DEFAULT_ENDPOINT,
        apiKey: aiApiKey.trim(),
      });
      const normalized = Array.from(new Set((models || []).filter(isSiliconFlowVisionModel))).sort((a, b) => a.localeCompare(b));
      setSiliconFlowVisionModels(normalized);
      localStorage.setItem('drawer_siliconflow_vision_models', JSON.stringify(normalized));
      if (normalized.length > 0 && (!aiApiModel.trim() || !isSiliconFlowVisionModel(aiApiModel))) {
        setAiApiModel(normalized[0]);
      }
      showToast(normalized.length > 0 ? `已刷新 ${normalized.length} 个视觉模型` : '没有从模型列表中识别到视觉模型');
    } catch (err: any) {
      const msg = String(err || '刷新模型列表失败');
      setSiliconFlowModelListError(msg);
      showToast('刷新视觉模型列表失败');
    } finally {
      setIsRefreshingSiliconFlowModels(false);
    }
  };

  const canvasAiOpenAiModelOptions = useMemo(() => {
    const merged = new Set<string>();
    canvasAiOpenAiModels.forEach(model => { if (model.trim()) merged.add(model.trim()); });
    OPENAI_COMPATIBLE_IMAGE_MODEL_OPTIONS.forEach(option => merged.add(option.value));
    canvasItemsRef.current.forEach(item => {
      if (item.ai?.type === 'image-generator' && item.ai?.provider === 'openai-compatible' && item.ai.model?.trim()) {
        merged.add(item.ai.model.trim());
      }
    });
    return Array.from(merged)
      .sort((a, b) => {
        const aImage = isCanvasAiLikelyOpenAiImageModel(a);
        const bImage = isCanvasAiLikelyOpenAiImageModel(b);
        if (aImage !== bImage) return aImage ? -1 : 1;
        return a.localeCompare(b);
      })
      .map(value => {
        const likelyImage = isCanvasAiLikelyOpenAiImageModel(value);
        return {
          value,
          label: value,
          meta: likelyImage ? '图像' : '未知',
          hint: likelyImage ? '模型名看起来支持图像生成' : '未能从模型名判断图像能力，可手动测试',
          section: likelyImage ? '可能支持图像' : '其它模型',
        };
      });
  }, [canvasAiOpenAiModels, canvasItems]);

  const canvasAiXaisModelOptions = useMemo(() => {
    const merged = new Set<string>();
    canvasAiXaisModels.forEach(model => {
      const trimmed = model.trim();
      if (trimmed && isCanvasAiXaisImageModel(trimmed)) merged.add(trimmed);
    });
    XAIS_CHAT_IMAGE_MODEL_OPTIONS.forEach(option => merged.add(option.value));
    canvasItemsRef.current.forEach(item => {
      if (item.ai?.type === 'image-generator' && normalizeCanvasAiProvider(item.ai?.provider || '') === 'xais-chat' && item.ai?.model?.trim()) {
        merged.add(item.ai.model.trim());
      }
    });
    return sortCanvasAiModelsForProvider('xais-chat', Array.from(merged)).map(value => ({
      value,
      label: XAIS_CHAT_IMAGE_MODEL_OPTIONS.find(option => option.value === value)?.label || value,
    }));
  }, [canvasAiXaisModels, canvasItems]);

  const getCanvasAiModelOptionsForProvider = (provider: CanvasAiProvider, mediaType: 'image' | 'video' = 'image') => (
    mediaType === 'video'
      ? XAIS_CHAT_VIDEO_MODEL_OPTIONS
      : provider === 'xais-chat'
      ? canvasAiXaisModelOptions
      : provider === 'openai-compatible'
      ? canvasAiOpenAiModelOptions
      : getCanvasAiModelOptions(provider, mediaType)
  );
  const canvasAiPromptPresets = useMemo(() => {
    const defaultIds = new Set(CANVAS_AI_PROMPT_PRESETS.map(preset => preset.id));
    const customById = new Map(customCanvasAiPromptPresets.map(preset => [preset.id, preset]));
    return [
      ...CANVAS_AI_PROMPT_PRESETS.map(preset => customById.get(preset.id) || preset),
      ...customCanvasAiPromptPresets.filter(preset => !defaultIds.has(preset.id)),
    ];
  }, [customCanvasAiPromptPresets]);
  const canvasAiPromptPresetSelectOptions = useMemo<RoundedSelectOption[]>(() => [
    { value: CANVAS_AI_PROMPT_PRESET_PLACEHOLDER, label: '节点…', hiddenInMenu: true },
    ...canvasAiPromptPresets.map(preset => ({
      value: preset.id,
      label: preset.label,
      hint: preset.hint || '创建带固定提示词的 AI 节点',
      meta: preset.aspectRatio,
      section: '节点预设',
      sectionHint: '选择后新增一个 AI 生图节点',
    })),
    { value: CANVAS_AI_PROMPT_PRESET_ADD_VALUE, label: '+ 新增节点预设', hint: '保存常用节点提示词', section: '操作', kind: 'action' },
    { value: CANVAS_AI_PROMPT_PRESET_MANAGE_VALUE, label: '管理节点预设', hint: '编辑名称和提示词', section: '操作', kind: 'action' },
  ], [canvasAiPromptPresets]);
  const canvasWorkflowTemplates = useMemo(() => {
    const customIds = new Set(customCanvasWorkflows.map(workflow => workflow.id));
    return [
      ...CANVAS_BUILT_IN_WORKFLOWS.map(workflow => customIds.has(workflow.id)
        ? customCanvasWorkflows.find(custom => custom.id === workflow.id) || workflow
        : workflow),
      ...customCanvasWorkflows.filter(workflow => !CANVAS_BUILT_IN_WORKFLOWS.some(builtIn => builtIn.id === workflow.id)),
    ];
  }, [customCanvasWorkflows]);
  const canvasWorkflowSelectOptions = useMemo<RoundedSelectOption[]>(() => [
    { value: CANVAS_WORKFLOW_SELECT_PLACEHOLDER, label: '工作…', hiddenInMenu: true },
    ...canvasWorkflowTemplates.map(workflow => ({
      value: workflow.id,
      label: workflow.label,
      hint: workflow.hint || '多节点自动生成流程',
      meta: workflow.builtin ? '内置' : '自定义',
      section: '工作流',
      sectionHint: '插入可展开的工作流模块',
    })),
    { value: CANVAS_WORKFLOW_SAVE_SELECTION_VALUE, label: '+ 保存选中', hint: '把当前选择封装成工作流', section: '操作', kind: 'action' },
    { value: CANVAS_WORKFLOW_MANAGE_VALUE, label: '管理工作流', hint: '编辑或另存工作流', section: '操作', kind: 'action' },
  ], [canvasWorkflowTemplates]);
  const canvasWorkflowManagerOptions = useMemo<RoundedSelectOption[]>(() => (
    canvasWorkflowTemplates.map(workflow => ({
      value: workflow.id,
      label: workflow.builtin ? `${workflow.label} · 内置` : workflow.label,
    }))
  ), [canvasWorkflowTemplates]);
  const canvasAiRemoteModelCount = canvasAiProvider === 'xais-chat'
    ? canvasAiXaisModels.length
    : canvasAiOpenAiModels.length;
  const canvasAiRemoteModelEmptyHint = canvasAiProvider === 'xais-chat'
    ? '填入 Key 后自动读取 /v1/models'
    : '填入 Key 和 URL 后自动刷新';

  const refreshCanvasAiOpenAiModels = async (silent = false) => {
    if (!isCanvasAiRemoteModelProvider(canvasAiProvider)) return;
    const provider = canvasAiProvider;
    const endpoint = getCanvasAiEndpointForModels(provider, canvasAiEndpoint);
    const apiKey = canvasAiApiKey.trim();
    if (!endpoint || !apiKey) return;
    canvasAiModelRefreshSignatureRef.current = `${provider}\n${endpoint}\n${apiKey}`;
    setIsRefreshingCanvasAiOpenAiModels(true);
    setCanvasAiOpenAiModelError('');
    try {
      const models = await invoke<string[]>('get_openai_compatible_models', {
        endpoint,
        apiKey,
      });
      const normalized = sortCanvasAiModelsForProvider(provider, Array.from(new Set((models || [])
        .map(model => model.trim())
        .filter(model => model && (provider !== 'xais-chat' || isCanvasAiXaisImageModel(model))))));
      if (provider === 'xais-chat') {
        setCanvasAiXaisModels(normalized);
      } else {
        setCanvasAiOpenAiModels(normalized);
      }
      localStorage.setItem(getCanvasAiRemoteStorageKey(provider), JSON.stringify(normalized));
      const preferredDefaultModel = getCanvasAiDefaultModel(provider);
      const preferredImageModel = provider === 'openai-compatible'
        ? normalized.find(isCanvasAiLikelyOpenAiImageModel)
        : '';
      const nextDefaultModel = normalized.includes(preferredDefaultModel)
        ? preferredDefaultModel
        : (preferredImageModel || normalized[0] || preferredDefaultModel);
      if (normalized.length > 0) {
        updateCanvasItemsImmediate(prev => prev.map(item => (
          item.ai?.type === 'image-generator'
            && normalizeCanvasAiProvider(item.ai.provider || canvasAiProvider) === provider
            && (!item.ai.model || !normalized.includes(item.ai.model))
            ? {
              ...item,
              ai: {
                ...item.ai,
                model: nextDefaultModel,
              },
            }
            : item
        )));
      }
      if (!silent) showToast(normalized.length > 0 ? `已刷新 ${normalized.length} 个模型` : '没有读取到可用图像模型');
    } catch (err: any) {
      const msg = String(err || '刷新模型列表失败');
      setCanvasAiOpenAiModelError(msg);
      if (!silent) showToast('刷新模型列表失败');
    } finally {
      setIsRefreshingCanvasAiOpenAiModels(false);
    }
  };

  useEffect(() => {
    if (!isCanvasMode) return;
    if (!isCanvasAiRemoteModelProvider(canvasAiProvider)) {
      canvasAiModelRefreshSignatureRef.current = '';
      return;
    }
    const apiKey = canvasAiApiKey.trim();
    const endpoint = getCanvasAiEndpointForModels(canvasAiProvider, canvasAiEndpoint).trim();
    if (!apiKey || !endpoint) {
      canvasAiModelRefreshSignatureRef.current = '';
      return;
    }
    const signature = `${canvasAiProvider}\n${endpoint}\n${apiKey}`;
    if (canvasAiModelRefreshSignatureRef.current === signature) return;
    const timer = window.setTimeout(() => {
      canvasAiModelRefreshSignatureRef.current = signature;
      void refreshCanvasAiOpenAiModels(true);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [isCanvasMode, canvasAiProvider, canvasAiApiKey, canvasAiEndpoint]);

  const getAiAnalysisConfig = (): AiAnalysisConfig => ({
    provider: aiApiProvider,
    endpoint: aiApiEndpoint.trim(),
    apiKey: aiApiKey.trim(),
    model: aiApiModel.trim(),
    proxy: '',
  });

  const handleAiProviderChange = (provider: string) => {
    setAiApiProvider(provider);
    if (isSiliconFlowProvider(provider)) {
      if (!aiApiEndpoint.trim() || aiApiEndpoint.includes('api.example.com') || aiApiEndpoint.includes('127.0.0.1')) {
        setAiApiEndpoint(SILICONFLOW_DEFAULT_ENDPOINT);
      }
      if (!aiApiModel.trim() || !isSiliconFlowVisionModel(aiApiModel)) {
        setAiApiModel(SILICONFLOW_DEFAULT_MODEL);
      }
    }
  };

  const hasAiAnalysis = isSiliconFlowProvider(aiApiProvider)
    ? aiApiEndpoint.trim().length > 0 && aiApiKey.trim().length > 0 && aiApiModel.trim().length > 0
    : aiApiEndpoint.trim().length > 0;


  useEffect(() => {
    // 旧版 edge 会写 drawer_startup_preview_pending_at 来触发启动预览。
    // 新版启动动画由 main 自己控制，这里只清理旧标记，避免被误判为 startup-preview。
    localStorage.removeItem('drawer_startup_preview_pending_at');

    return () => {
      if (startupAutoCloseTimerRef.current) clearTimeout(startupAutoCloseTimerRef.current);
      if (idleAutoCloseTimerRef.current) clearTimeout(idleAutoCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    invoke('get_shortcut', { name: 'update_shortcut' }).then((res: any) => { if (res) setShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_snip_shortcut' }).then((res: any) => { if (res) setSnipShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_text_shortcut' }).then((res: any) => { if (res) setTextShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_search_shortcut' }).then((res: any) => { if (res) setSearchShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_trigger_shortcut' }).then((res: any) => { if (res) { setTriggerShortcut(res); localStorage.setItem('drawer_trigger_shortcut', res); } }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_note_shortcut' }).then((res: any) => { if (res) setNoteShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_canvas_shortcut' }).then((res: any) => { if (res) setCanvasShortcut(res); }).catch(()=>{});
    invoke('get_auto_start').then((res: any) => setIsAutoStart(!!res)).catch(()=>{});
    invoke('get_local_ip').then((res: any) => setLocalIP(String(res || ''))).catch(()=>{});
    invoke('get_mobile_pair_url').then((res: any) => setMobilePairUrl(String(res || ''))).catch(()=>{});
    invoke('set_topmost', { topmost: true }).catch(()=>{});
  }, []);

  const handleOpenTextInput = () => { setShowTextInput(true); setIsSearchActive(false); setShowSettings(false); setShowFolderModal(false); };
  const handleOpenFolderModal = () => { setShowFolderModal(true); setIsSearchActive(false); setShowSettings(false); setShowTextInput(false); };
  const commitQuickText = () => {
    if (!quickText.trim()) return;
    const newItem: BufferItem = createTextOrUrlItem(quickText, '灵感笔记');
    pushDrawerUndoSnapshot('新增文字');
    setItems(prev => [newItem, ...prev]);
    setActiveTab('text');
    setQuickText('');
    handleCloseTextInput();
  };
  const toggleSearch = () => {
    if (!isSearchActive) {
      setIsSearchActive(true); setShowSettings(false); setShowTextInput(false); setShowFolderModal(false);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setIsSearchActive(false); setSearchQuery('');
    }
  };
  const toggleSettings = () => {
    if (!showSettings) {
      setShowSettings(true); setIsSearchActive(false); setShowTextInput(false); setShowFolderModal(false);
    } else {
      setShowSettings(false);
    }
  };

  useEffect(() => {
    if (!showSettings) return;
    const closeSettingsOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('[data-drawer-settings-panel="true"]') ||
        target?.closest('[data-drawer-settings-toggle="true"]')
      ) {
        return;
      }
      setShowSettings(false);
    };

    document.addEventListener('pointerdown', closeSettingsOnOutsidePointer, true);
    return () => {
      document.removeEventListener('pointerdown', closeSettingsOnOutsidePointer, true);
    };
  }, [showSettings]);

  const toggleTriggerMode = () => {
    const current = triggerModeRef.current;
    const next: TriggerMode = current === 'edge' ? 'float' : 'edge';
    setTriggerMode(next);
    triggerModeRef.current = next;
    localStorage.setItem('drawer_trigger_mode', next);
    emitTo('edge', 'trigger-mode-changed', next).catch(() => {});
    showToast(next === 'float' ? '已切换为悬浮方块模式' : '已切换为侧边小条模式');
  };

  useEffect(() => {
    let unlistenTrayTrigger: (() => void) | undefined;
    let unlistenTrayTheme: (() => void) | undefined;

    listen('tray-toggle-trigger-mode', () => {
      if (stateRef.current.isAntiTouchMode) {
        enforceAntiTouchClosed(true);
        return;
      }
      toggleTriggerMode();
    }).then(f => unlistenTrayTrigger = f);

    listen('tray-toggle-theme', () => {
      setIsDark(prev => {
        const next = !prev;
        localStorage.setItem('theme', next ? 'dark' : 'light');
        emitTo('edge', 'theme-changed', next ? 'dark' : 'light').catch(() => {});
        showToast(next ? '已切换为深色主题' : '已切换为浅色主题');
        return next;
      });
    }).then(f => unlistenTrayTheme = f);

    return () => {
      if (unlistenTrayTrigger) unlistenTrayTrigger();
      if (unlistenTrayTheme) unlistenTrayTheme();
    };
  }, [triggerMode]);

  const displayItems = useMemo(() => {
    let result = items as AlchemyBufferItem[];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => getAlchemySearchText(item).includes(q));
    }
    if (activeFolderId === 'all') {
      result = result.filter(item => !item.folderId);
    } else {
      result = result.filter(item => item.folderId === activeFolderId);
    }
    if (activeTab === 'notes' || activeTab === 'calendar') {
      return [];
    }
    if (activeTab === 'alchemy') {
      return result.filter(item => isAlchemyCandidate(item));
    }
    return result.filter(item => activeTab === 'all' || item.type === activeTab);
  }, [items, activeTab, searchQuery, activeFolderId]);

  const alchemyCount = useMemo(() => (items as AlchemyBufferItem[]).filter(item => isAlchemyCandidate(item)).length, [items]);
  const finishedAlchemyCount = useMemo(() => (items as AlchemyBufferItem[]).filter(item => getAlchemyState(item) === 'alchemy').length, [items]);

  const quickAccessItems = useMemo(() => items.filter(item => item.isQuickAccess), [items]);
  const isUtilityActiveTab = activeTab === 'notes' || activeTab === 'calendar' || isCanvasMode;
  const renderedDisplayItems = useMemo(
    () => displayItems.slice(0, drawerRenderLimit),
    [displayItems, drawerRenderLimit],
  );
  const hasMoreDisplayItems = drawerRenderLimit < displayItems.length;
  const loadMoreDisplayItems = () => {
    setDrawerRenderLimit(limit => Math.min(displayItems.length, limit + DRAWER_RENDER_BATCH_SIZE));
  };
  const handleDrawerContentScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (isUtilityActiveTab || !hasMoreDisplayItems) return;
    const node = event.currentTarget;
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - DRAWER_RENDER_LOAD_AHEAD_PX) {
      loadMoreDisplayItems();
    }
  };

  useEffect(() => {
    setDrawerRenderLimit(DRAWER_INITIAL_RENDER_LIMIT);
    drawerScrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab, activeFolderId, searchQuery, isCanvasMode]);

  const calendarEvents = useMemo<CalendarScheduleEvent[]>(() => {
    const sourceById = new Map(items.map(item => [item.id, item]));

    return openFloatingNoteEntries.flatMap(({ label, snapshot }) => {
      if (!snapshot || snapshot.type !== 'text' || snapshot.noteMode !== 'schedule' || !Array.isArray(snapshot.scheduleItems)) {
        return [];
      }

      const source = sourceById.get(snapshot.itemId);
      const fallbackTagIds = getFolderTagIds(snapshot.folderId || source?.folderId, snapshot.tagIds);
      const sourceTitle = snapshot.name || source?.remark || source?.name || source?.content || '日程便签';

      return snapshot.scheduleItems.map(schedule => {
        const tagIds = getFolderTagIds(undefined, schedule.tagIds && schedule.tagIds.length > 0 ? schedule.tagIds : fallbackTagIds);
        const dayKey = schedule.startAt ? getLocalDateKey(schedule.startAt) : '';
        return {
          id: `${label}:${schedule.id}`,
          noteLabel: label,
          note: snapshot,
          item: source,
          schedule,
          title: schedule.text,
          sourceTitle,
          dayKey,
          tagIds,
          isUnscheduled: !dayKey,
        } as CalendarScheduleEvent;
      });
    });
  }, [openFloatingNoteEntries, items, noteManagerVersion]);

  const filteredCalendarEvents = useMemo(() => (
    calendarEvents.filter(event => {
      if (calendarTagFilter === 'all') return true;
      if (calendarTagFilter === 'untagged') return event.tagIds.length === 0;
      return event.tagIds.includes(calendarTagFilter);
    })
  ), [calendarEvents, calendarTagFilter]);
  const calendarTagOptions = useMemo(() => ([
    { value: 'all', label: '全部' },
    { value: 'untagged', label: '无标签' },
    ...folders.map(folder => ({ value: folder.id, label: folder.name })),
  ]), [folders]);
  const calendarTagFilterLabel = calendarTagOptions.find(option => option.value === calendarTagFilter)?.label || '全部';
  const calendarScheduleNoteOptions = useMemo<RoundedSelectOption[]>(() => {
    const sourceById = new Map(items.map(item => [item.id, item]));
    const existing = openFloatingNoteEntries
      .filter(entry => (
        entry.snapshot?.type === 'text' &&
        entry.snapshot.noteMode === 'schedule' &&
        Array.isArray(entry.snapshot.scheduleItems)
      ))
      .map((entry, index) => {
        const snapshot = entry.snapshot!;
        const source = sourceById.get(snapshot.itemId);
        const title = snapshot.name || source?.remark || source?.name || `日程便签 ${index + 1}`;
        const count = snapshot.scheduleItems?.length || 0;
        return {
          value: entry.label,
          label: `${title}${count > 0 ? ` · ${count}` : ''}`,
        };
      });

    return [
      { value: CALENDAR_NEW_NOTE_TARGET, label: '新便签' },
      ...existing,
    ];
  }, [openFloatingNoteEntries, items, noteManagerVersion]);

  useEffect(() => {
    if (
      calendarTargetNoteLabel !== CALENDAR_NEW_NOTE_TARGET &&
      !calendarScheduleNoteOptions.some(option => option.value === calendarTargetNoteLabel)
    ) {
      setCalendarTargetNoteLabel(CALENDAR_NEW_NOTE_TARGET);
    }
  }, [calendarTargetNoteLabel, calendarScheduleNoteOptions]);

  const calendarEventsByDay = useMemo(() => {
    const map = new Map<string, CalendarScheduleEvent[]>();
    filteredCalendarEvents.forEach(event => {
      if (!event.dayKey) return;
      const list = map.get(event.dayKey) || [];
      list.push(event);
      map.set(event.dayKey, list);
    });
    map.forEach(list => list.sort(compareCalendarEvents));
    return map;
  }, [filteredCalendarEvents]);

  const selectedCalendarEvents = calendarEventsByDay.get(getLocalDateKey(calendarSelectedDate)) || [];
  const unscheduledCalendarEvents = filteredCalendarEvents
    .filter(event => event.isUnscheduled)
    .sort(compareCalendarEvents);
  const calendarOpenCount = filteredCalendarEvents.filter(event => !event.schedule.done).length;
  const selectedCalendarOpenCount = selectedCalendarEvents.filter(event => !event.schedule.done).length;

  const sendSystemNotification = async (title: string, body: string, options: { silent?: boolean } = {}) => {
    try {
      await invoke('show_system_notification', { title, body });
      if (!options.silent) showToast('已发送 Windows 通知');
      return true;
    } catch (err) {
      console.error('Windows notification failed:', err);
      if (!options.silent) showToast('Windows 通知发送失败');
      return false;
    }
  };

  useEffect(() => {
    if (!calendarNotificationsEnabled) return;

    const checkTodaySchedules = () => {
      const now = Date.now();
      const hour = new Date(now).getHours();
      const notificationHour = [...CALENDAR_NOTIFICATION_HOURS]
        .reverse()
        .find(candidate => hour >= candidate);
      if (!notificationHour) return;

      const todayKey = getLocalDateKey(now);
      const dueEvents = (calendarEventsByDay.get(todayKey) || []).filter(event => !event.schedule.done);
      if (dueEvents.length === 0) return;

      const storageKey = `${CALENDAR_NOTIFICATION_SENT_STORAGE_PREFIX}${todayKey}_${notificationHour}`;
      if (localStorage.getItem(storageKey) === 'sent') return;

      sendSystemNotification(
        `今天有 ${dueEvents.length} 项日程`,
        getCalendarNotificationBody(dueEvents),
        { silent: true },
      ).then(sent => {
        if (sent) localStorage.setItem(storageKey, 'sent');
      });
    };

    checkTodaySchedules();
    const timer = window.setInterval(checkTodaySchedules, 60_000);
    return () => window.clearInterval(timer);
  }, [calendarNotificationsEnabled, calendarEventsByDay]);

  const calendarMonthDays = useMemo(() => {
    const monthDate = new Date(calendarMonth);
    const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const firstOffset = firstOfMonth.getDay();
    const gridStart = addLocalDays(firstOfMonth.getTime(), -firstOffset);
    return Array.from({ length: 42 }, (_, index) => addLocalDays(gridStart, index));
  }, [calendarMonth]);

  const patchCalendarScheduleItem = async (
    noteLabel: string,
    scheduleId: string,
    patch: Partial<FloatingNoteScheduleItem>,
  ) => {
    const snapshot = readFloatingNoteSnapshot(noteLabel);
    if (!snapshot || !Array.isArray(snapshot.scheduleItems)) return;
    pushDrawerUndoSnapshot('修改日程');
    const next = {
      ...snapshot,
      noteMode: 'schedule' as const,
      scheduleItems: snapshot.scheduleItems.map(item => (
        item.id === scheduleId ? { ...item, ...patch, updatedAt: Date.now() } : item
      )),
      updatedAt: Date.now(),
    };
    await syncCalendarScheduleSnapshot(noteLabel, next);
  };

  const syncCalendarScheduleSnapshot = async (noteLabel: string, snapshot: FloatingNoteSnapshot) => {
    const content = snapshot.type === 'text' && snapshot.noteMode === 'schedule'
      ? getScheduleTextContent(snapshot.scheduleItems)
      : (snapshot.content || '');
    const next = {
      ...snapshot,
      content,
      updatedAt: Date.now(),
    } as FloatingNoteSnapshot;

    localStorage.setItem(floatingNoteStorageKey(noteLabel), JSON.stringify(next));
    if (next.type === 'text') {
      setItems(prev => {
        let found = false;
        const updated = prev.map(item => {
          if (item.id !== next.itemId || item.type !== 'text') return item;
          found = true;
          return {
            ...item,
            type: 'text',
            content,
            name: next.name || item.name || '日程便签',
            url: undefined,
            path: undefined,
            sourceUrl: undefined,
            pageUrl: undefined,
            originalUrl: undefined,
            isUrl: false,
          } as BufferItem;
        });

        if (found || !next.itemId.startsWith('calendar_schedule_')) return updated;
        return [{
          id: next.itemId,
          type: 'text',
          content,
          name: next.name || '日程便签',
          remark: next.name || '日程便签',
          remarks: next.name ? [next.name] : undefined,
          createdAt: next.createdAt || Date.now(),
          folderId: next.folderId,
        } as BufferItem, ...updated];
      });
    }
    await emitFloatingNoteUpdated(noteLabel, next).catch(() => {});
    refreshNoteManager();
    return next;
  };

  const deleteCalendarScheduleItem = async (event: CalendarScheduleEvent) => {
    const snapshot = readFloatingNoteSnapshot(event.noteLabel);
    if (!snapshot || !Array.isArray(snapshot.scheduleItems)) return;
    pushDrawerUndoSnapshot('删除日程');

    const next = {
      ...snapshot,
      noteMode: 'schedule' as const,
      scheduleItems: snapshot.scheduleItems.filter(item => item.id !== event.schedule.id),
      updatedAt: Date.now(),
    };
    await syncCalendarScheduleSnapshot(event.noteLabel, next);
  };

  const ensureCalendarScheduleNote = (targetLabel = calendarTargetNoteLabel) => {
    if (targetLabel !== CALENDAR_NEW_NOTE_TARGET) {
      const target = openFloatingNoteEntries.find(entry => entry.label === targetLabel);
      const snapshot = readFloatingNoteSnapshot(targetLabel) || target?.snapshot;
      if (
        snapshot?.type === 'text' &&
        snapshot.noteMode === 'schedule' &&
        Array.isArray(snapshot.scheduleItems)
      ) {
        return { label: targetLabel, snapshot };
      }
      setCalendarTargetNoteLabel(CALENDAR_NEW_NOTE_TARGET);
      showToast('这个日程便签不可用，已改为新建');
    }

    const openLabels = readOpenFloatingNoteLabels();
    const label = FLOATING_NOTE_LABELS.find(item => !openLabels.includes(item));
    if (!label) {
      showToast(`最多同时保存 ${MAX_FLOATING_NOTE_COUNT} 个桌面便签，请先关闭一个`);
      return null;
    }

    const now = Date.now();
    const tagIds = calendarTagFilter !== 'all' && calendarTagFilter !== 'untagged' ? [calendarTagFilter] : [];
    const snapshot: FloatingNoteSnapshot = {
      id: `calendar_schedule_${now}`,
      itemId: `calendar_schedule_${now}`,
      type: 'text',
      name: '日程便签',
      content: '',
      noteMode: 'schedule',
      scheduleItems: [],
      tagIds,
      createdAt: now,
      updatedAt: now,
      width: TEXT_FLOATING_NOTE_SIZES.large.width,
      height: TEXT_FLOATING_NOTE_SIZES.large.height,
    };

    localStorage.setItem(floatingNoteStorageKey(label), JSON.stringify(snapshot));
    rememberOpenFloatingNoteLabel(label);
    return { label, snapshot };
  };

  const addCalendarScheduleItem = async () => {
    const text = calendarDraftText.trim();
    if (!text) return;

    const requestedTargetLabel = calendarTargetNoteLabel;
    const target = ensureCalendarScheduleNote(requestedTargetLabel);
    if (!target) return;
    pushDrawerUndoSnapshot('新增日程');

    const tagIds = calendarTagFilter === 'untagged'
      ? []
      : (calendarTagFilter !== 'all'
        ? [calendarTagFilter]
        : getFolderTagIds(target.snapshot.folderId, target.snapshot.tagIds));
    const now = Date.now();
    const nextItem: FloatingNoteScheduleItem = {
      id: `schedule_${now}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      done: false,
      priority: calendarDraftPriority,
      startAt: startOfLocalDay(calendarSelectedDate),
      allDay: true,
      tagIds,
      sourceItemId: target.snapshot.itemId,
      createdAt: now,
    };
    const next = {
      ...target.snapshot,
      type: 'text' as const,
      noteMode: 'schedule' as const,
      scheduleItems: [...(target.snapshot.scheduleItems || []), nextItem],
      updatedAt: now,
    };

    await syncCalendarScheduleSnapshot(target.label, next);
    if (requestedTargetLabel === CALENDAR_NEW_NOTE_TARGET) {
      setCalendarTargetNoteLabel(target.label);
    }
    setCalendarDraftText('');
  };

  const moveCalendarMonth = (delta: number) => {
    setCalendarMonth(prev => {
      const date = new Date(prev);
      return new Date(date.getFullYear(), date.getMonth() + delta, 1).getTime();
    });
  };

  const jumpCalendarToday = () => {
    const today = startOfLocalDay(Date.now());
    setCalendarMonth(today);
    setCalendarSelectedDate(today);
  };

  const getCalendarTagName = (tagId?: string) => {
    if (!tagId) return '无标签';
    return folders.find(folder => folder.id === tagId)?.name || '未知标签';
  };

  const renderCalendarEvent = (event: CalendarScheduleEvent) => {
    const primaryTagId = event.tagIds[0];
    const priority = normalizeSchedulePriority(event.schedule.priority);
    return (
      <div key={event.id} className="group/calendar-event rounded-[18px] border border-stone-200/60 bg-white/58 px-3 py-2.5 shadow-sm shadow-black/[0.02] transition-colors hover:bg-white/78 dark:border-stone-700/60 dark:bg-stone-950/24 dark:hover:bg-stone-900/46">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => patchCalendarScheduleItem(event.noteLabel, event.schedule.id, { done: !event.schedule.done })}
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
              event.schedule.done
                ? 'border-stone-800 bg-stone-800 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                : 'border-stone-300 bg-white/75 text-transparent dark:border-stone-600 dark:bg-stone-950'
            }`}
            title={event.schedule.done ? '标记为未完成' : '标记为完成'}
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={() => focusFloatingNote(event.noteLabel, event.note)}
            className="min-w-0 flex-1 text-left"
            title="打开来源便签"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-black leading-none ${getSchedulePriorityClass(priority)}`}>
                {priority}
              </span>
              <div className={`min-w-0 flex-1 truncate text-xs font-bold ${event.schedule.done ? 'text-stone-400 line-through dark:text-stone-500' : 'text-stone-800 dark:text-stone-100'}`}>
                {event.title}
              </div>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold">
              <span className="inline-flex items-center gap-1 text-amber-600/85 dark:text-amber-300/85">
                <Clock className="h-3 w-3" />
                {formatScheduleDateLabel(event.schedule.startAt)}
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-600/85 dark:text-emerald-300/85">
                <Tag className="h-3 w-3" />
                {getCalendarTagName(primaryTagId)}
              </span>
              <span className="min-w-0 truncate text-stone-400/90 dark:text-stone-500">{event.sourceTitle}</span>
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deleteCalendarScheduleItem(event);
            }}
            className="shrink-0 rounded-[10px] p-1 text-stone-300 opacity-70 transition-all hover:bg-red-50 hover:text-red-500 hover:opacity-100 dark:text-stone-600 dark:hover:bg-red-900/25 dark:hover:text-red-300"
            title="删除待办"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const normalizeAlchemyResult = (item: AlchemyBufferItem, raw: any): AlchemyResult => {
    const fallback = buildLocalAlchemyResult(item, 'ai-placeholder');
    if (!raw || typeof raw !== 'object') return fallback;
    return {
      ...fallback,
      ...raw,
      colors: Array.isArray(raw.colors) && raw.colors.length > 0 ? raw.colors.slice(0, 4) : fallback.colors,
      keywords: Array.isArray(raw.keywords) && raw.keywords.length > 0 ? raw.keywords : fallback.keywords,
      borrow: Array.isArray(raw.borrow) && raw.borrow.length > 0 ? raw.borrow : fallback.borrow,
      avoid: Array.isArray(raw.avoid) && raw.avoid.length > 0 ? raw.avoid : fallback.avoid,
      materials: Array.isArray(raw.materials) && raw.materials.length > 0 ? raw.materials : fallback.materials,
      form: typeof raw.form === 'string' && raw.form.trim() ? raw.form : fallback.form,
      cmf: typeof raw.cmf === 'string' && raw.cmf.trim() ? raw.cmf : fallback.cmf,
      summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : undefined,
      generatedAt: Date.now(),
    };
  };

  const runLocalPaletteAnalysis = async (item: AlchemyBufferItem, options?: { silent?: boolean; note?: string }) => {
    if (!isAlchemyCandidate(item)) return null;

    setItems(prev => prev.map(i => i.id === item.id ? {
      ...i,
      alchemy: {
        ...(i as AlchemyBufferItem).alchemy,
        state: 'analyzing',
        note: options?.note || '正在自动提取配色...',
        createdAt: (i as AlchemyBufferItem).alchemy?.createdAt || Date.now(),
      },
    } as BufferItem : i));

    try {
      const result = await buildLocalPaletteOnlyResult(item);
      setItems(prev => prev.map(i => {
        if (i.id !== item.id) return i;
        const current = i as AlchemyBufferItem;
        const currentResult = current.alchemy?.result;
        if (current.alchemy?.state === 'alchemy' && currentResult?.analysisMode === 'ai') {
          return i;
        }
        return {
          ...i,
          alchemy: {
            state: 'alchemy',
            note: options?.note || '已自动提取配色。',
            result: { ...result, analysisMode: 'palette' },
            createdAt: current.alchemy?.createdAt || Date.now(),
            analyzedAt: Date.now(),
          },
        } as BufferItem;
      }));
      if (!options?.silent) {
        showToast(result.colorSource === 'fallback-preset' ? '已生成回退色板，建议保存为本地图片后重试' : '已完成本地配色分析');
      }
      return result;
    } catch (err) {
      console.warn('自动配色分析失败:', err);
      setItems(prev => prev.map(i => i.id === item.id ? {
        ...i,
        alchemy: {
          ...(i as AlchemyBufferItem).alchemy,
          state: 'error',
          error: '自动配色分析失败',
          note: '自动配色分析失败',
          createdAt: (i as AlchemyBufferItem).alchemy?.createdAt || Date.now(),
        },
      } as BufferItem : i));
      return null;
    }
  };

  const triggerAutoPaletteForItems = (incomingItems: BufferItem[]) => {
    incomingItems
      .filter(item => isAlchemyCandidate(item as AlchemyBufferItem))
      .forEach((item, index) => {
        window.setTimeout(() => {
          void runLocalPaletteAnalysis(item as AlchemyBufferItem, { silent: true, note: '已自动提取配色。' });
        }, index * 20);
      });
  };

  const ensureAiGeneratedFolder = () => {
    const existing = foldersRef.current.find(folder => folder.name === AI_GENERATED_FOLDER_NAME);
    if (existing) return existing.id;

    const newFolder: Folder = {
      id: AI_GENERATED_FOLDER_ID,
      name: AI_GENERATED_FOLDER_NAME,
      color: AI_GENERATED_FOLDER_COLOR,
    };
    setFolders(prev => prev.some(folder => folder.id === newFolder.id || folder.name === newFolder.name)
      ? prev
      : [...prev, newFolder]);
    return newFolder.id;
  };

  const ensureAiGeneratedVideoFolder = () => {
    const existing = foldersRef.current.find(folder => folder.name === AI_GENERATED_VIDEO_FOLDER_NAME);
    if (existing) return existing.id;

    const newFolder: Folder = {
      id: AI_GENERATED_VIDEO_FOLDER_ID,
      name: AI_GENERATED_VIDEO_FOLDER_NAME,
      color: AI_GENERATED_VIDEO_FOLDER_COLOR,
    };
    setFolders(prev => prev.some(folder => folder.id === newFolder.id || folder.name === newFolder.name)
      ? prev
      : [...prev, newFolder]);
    return newFolder.id;
  };

  const addGeneratedImagesToDrawer = (generatedItems: BufferItem[]) => {
    const cleanItems = generatedItems.filter(item => item.type === 'image');
    if (cleanItems.length === 0) return;

    const folderId = ensureAiGeneratedFolder();
    const now = Date.now();
    const savedItems = cleanItems.map((item, index) => ({
      ...stripHeavyDataThumbnail(item),
      folderId,
      createdAt: item.createdAt || now + index,
      isQuickAccess: false,
    } as BufferItem));
    const savedIds = new Set(savedItems.map(item => item.id));
    setItems(prev => [
      ...savedItems.filter(item => !prev.some(existing => existing.id === item.id)),
      ...prev,
    ]);
    triggerAutoPaletteForItems(savedItems);

    const latestCacheDir = (
      webImageCacheDirRef.current ||
      localStorage.getItem('drawer_web_image_cache_dir') ||
      ''
    ).trim();

    savedItems.forEach((item) => {
      const source = item.sourceUrl || item.originalUrl || item.url || item.path || '';
      if (!source || source.startsWith('asset:') || /^[a-zA-Z]:[\\/]/.test(source) || source.startsWith('\\\\')) return;

      invoke<string>('cache_web_image', {
        url: source,
        name: item.name || item.content || AI_GENERATED_FOLDER_NAME,
        dir: latestCacheDir || undefined,
      })
        .then((cachedPath) => {
          if (!cachedPath) return;
          const cachedUrl = convertFileSrc(cachedPath);
          const sourceIsDataImage = isDataImageSourceValue(source);
          const originalUrl = sourceIsDataImage || isDataImageSourceValue(item.originalUrl)
            ? undefined
            : item.originalUrl || source;
          const cachedItem = {
            ...item,
            url: cachedUrl,
            path: cachedPath,
            sourceUrl: sourceIsDataImage ? undefined : source,
            originalUrl,
          } as BufferItem;
          setItems(prev => prev.map(existing => existing.id === item.id ? cachedItem : existing));
          updateCanvasItemsImmediate(prev => prev.map(canvasItem => canvasItem.item.id === item.id
            ? { ...canvasItem, item: cachedItem }
            : canvasItem));
          triggerAutoPaletteForItems([cachedItem]);
        })
        .catch((err) => {
          console.warn('AI 生图缓存失败:', err);
        });
    });

    if (savedIds.size > 0) {
      setActiveFolderId(folderId);
      setActiveTab('image');
    }
  };

  const addGeneratedVideosToDrawer = (generatedItems: BufferItem[]) => {
    const cleanItems = generatedItems.filter(item => item.type === 'video');
    if (cleanItems.length === 0) return;

    const folderId = ensureAiGeneratedVideoFolder();
    const now = Date.now();
    const savedItems = cleanItems.map((item, index) => ({
      ...stripHeavyDataThumbnail(item),
      folderId,
      createdAt: item.createdAt || now + index,
      isQuickAccess: false,
    } as BufferItem));
    const savedIds = new Set(savedItems.map(item => item.id));
    setItems(prev => [
      ...savedItems.filter(item => !prev.some(existing => existing.id === item.id)),
      ...prev,
    ]);
    if (savedIds.size > 0) {
      setActiveFolderId(folderId);
      setActiveTab('video');
    }
  };

  const focusAlchemyCard = (itemId: string, options?: { toast?: boolean }) => {
    if (stateRef.current.isAntiTouchMode) {
      enforceAntiTouchClosed(true);
      return;
    }
    setActiveTab('alchemy');
    setSelectedAlchemyItemId(itemId);
    setIsOpen(true);
    window.setTimeout(() => {
      const target = document.querySelector(`[data-alchemy-card-id="${itemId}"]`);
      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
    if (options?.toast) showToast('已定位到炼金卡');
  };

  const runAiAlchemyFromCard = async (item: AlchemyBufferItem) => {
    if (!isAlchemyCandidate(item)) {
      showToast('只有图片灵感可以进行 AI 炼金');
      return;
    }

    const existingResult = item.alchemy?.result;
    const hasFinishedAiAlchemy = item.alchemy?.state === 'alchemy' && !!existingResult && existingResult.analysisMode !== 'palette';
    if (hasFinishedAiAlchemy) {
      focusAlchemyCard(item.id, { toast: true });
      return;
    }

    focusAlchemyCard(item.id);
    if (!hasAiAnalysis) {
      showToast('请先在设置中配置硅基流动 API 和模型');
      return;
    }
    await runAlchemyAnalysis(item);
  };

  const runAlchemyAnalysis = async (item: AlchemyBufferItem) => {
    if (!isAlchemyCandidate(item)) {
      showToast('只有图片灵感可以进行 CMF 分析');
      return;
    }

    const useAi = hasAiAnalysis;
    const itemName = item.name || item.content || '参考图';
    const imageSource = item.path || item.url || '';
    setActiveTab('alchemy');
    setSelectedAlchemyItemId(item.id);
    setItems(prev => prev.map(i => i.id === item.id ? {
      ...i,
      alchemy: {
        ...(i as AlchemyBufferItem).alchemy,
        state: 'analyzing',
        note: useAi ? (isSiliconFlowProvider(aiApiProvider) ? `正在用硅基流动 ${aiApiModel || '视觉模型'} 分析 CMF、造型语言和可借鉴点...` : '正在用 AI 分析 CMF、造型语言和可借鉴点...') : '正在用本地算法提取图片配色...',
        createdAt: (i as AlchemyBufferItem).alchemy?.createdAt || Date.now(),
      },
    } as BufferItem : i));

    await new Promise(resolve => requestAnimationFrame(() => window.setTimeout(resolve, 20)));

    if (!useAi) {
      await runLocalPaletteAnalysis(item, { note: '本地算法已提取配色。' });
      return;
    }

    try {
      const raw = await invoke<AlchemyResult>('analyze_cmf_card', {
        imageSource,
        itemName,
        note: item.remark || item.content || '',
        apiConfig: getAiAnalysisConfig(),
      });
      const result = normalizeAlchemyResult(item, raw);
      setItems(prev => prev.map(i => i.id === item.id ? {
        ...i,
        alchemy: {
          state: 'alchemy',
          note: isSiliconFlowProvider(aiApiProvider) ? '硅基流动视觉模型已生成 CMF、造型语言和借鉴点。' : 'AI 已生成 CMF、造型语言和借鉴点。',
          result: { ...result, analysisMode: result.analysisMode || 'ai' },
          createdAt: (i as AlchemyBufferItem).alchemy?.createdAt || Date.now(),
          analyzedAt: Date.now(),
        },
      } as BufferItem : i));
      showToast(isSiliconFlowProvider(aiApiProvider) ? '硅基流动视觉模型分析完成' : 'CMF 炼金完成');
    } catch (err: any) {
      const result = await buildLocalPaletteOnlyResult(item, 'ai_error_local_palette');
      setItems(prev => prev.map(i => i.id === item.id ? {
        ...i,
        alchemy: {
          state: 'alchemy',
          note: 'AI 接口暂不可用，已先保留本地配色分析。',
          result,
          createdAt: (i as AlchemyBufferItem).alchemy?.createdAt || Date.now(),
          analyzedAt: Date.now(),
        },
      } as BufferItem : i));
      showToast('AI 接口暂不可用，已先完成本地配色分析');
    }
  };

  const deleteAlchemyOnly = (itemId: string) => {
    pushDrawerUndoSnapshot('删除炼金');
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, alchemy: undefined } as BufferItem : i));
    setSelectedAlchemyItemId(prev => prev === itemId ? null : prev);
    showToast('已删除炼金卡，原图片已保留');
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('mobile-server-ready', (event: any) => {
      const url = String(event.payload || '');
      if (url) setMobilePairUrl(url);
    }).then(f => unlisten = f);
    return () => { if (unlisten) unlisten(); };
  }, []);

  useEffect(() => {
    let unlisten: () => void;
    listen('mobile-connected', () => {
      if (!isMobileConnected) showToast('📱 手机连接成功！');
      setIsMobileConnected(true); resetDisconnectTimer();
    }).then(f => unlisten = f);
    return () => { if (unlisten) unlisten(); };
  }, [isMobileConnected]);

  useEffect(() => {
    let unlisten: () => void;
    listen('mobile-data-received', async (event: any) => {
      const data = event.payload || {};
      if (!shouldAcceptMobilePayload(data)) return;
      if (!isMobileConnected) showToast('📱 手机已连接');
      setIsMobileConnected(true); resetDisconnectTimer();
      const newItem: BufferItem = { id: Math.random().toString(36).substring(2, 9), createdAt: Date.now(), ...data };
      if (newItem.type === 'image' && newItem.path && !newItem.url) {
        newItem.url = convertFileSrc(newItem.path);
      }
      if (newItem.type === 'video' && newItem.path) {
        try {
          const thumb = await getVideoThumbnail(newItem.path);
          if (thumb) newItem.thumbnail = thumb;
          if (!newItem.url) newItem.url = convertFileSrc(newItem.path);
        } catch (e) {
          if (!newItem.url) newItem.url = convertFileSrc(newItem.path);
        }
      }
      pushDrawerUndoSnapshot('接收手机素材');
      setItems(prev => [newItem, ...prev]);
      setActiveTab('all'); setActiveFolderId('all'); if (!stateRef.current.isAntiTouchMode) setIsOpen(true);
      if (newItem.type === 'image') triggerAutoPaletteForItems([newItem]);
    }).then(f => unlisten = f);
    return () => { if (unlisten) unlisten(); };
  }, [isMobileConnected]);

  useEffect(() => { return () => { if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current); }; }, []);

  const shouldAcceptMobilePayload = (data: any) => {
    const explicitSignature = typeof data?.mobileSignature === 'string' ? data.mobileSignature : '';
    const fallbackSignature = [
      data?.type || '',
      data?.name || '',
      data?.path || '',
      data?.url || '',
      data?.content || '',
    ].join('\n');
    const signature = explicitSignature || fallbackSignature;
    if (!signature.trim()) return true;

    const now = Date.now();
    const recent = recentMobilePayloadsRef.current;
    Object.keys(recent).forEach(key => {
      if (now - recent[key] > 8000) delete recent[key];
    });

    if (recent[signature] && now - recent[signature] < 2500) {
      recent[signature] = now;
      return false;
    }

    recent[signature] = now;
    return true;
  };

  // 🌟 完美修复的快捷键注册逻辑
  useEffect(() => {
    let cancelled = false;
    const setupShortcuts = async () => {
      // 封装一个极其安全的注册器
      // 🌟 带有屏幕报错反馈的注册器
      const safeRegister = async (key: string, handler: (e: any) => void) => {
        if (!key || cancelled) return;
        try {
          const isReg = await isRegistered(key);
          if (cancelled) return;
          if (isReg) await unregister(key);
          if (cancelled) return;
          await register(key, handler);
          console.log(`✅ 快捷键 ${key} 注册成功`);
        } catch (error: any) {
          const msg = error.message || String(error);
          if (msg.includes('already registered')) return; // 🌟 忽略 React 双重复挂载引起的假报错
          console.error(`❌ 快捷键 ${key} 注册失败:`, error);
          showToast(`快捷键报错: ${msg}`);
        }
      };

      await safeRegister(shortcut, (e) => {
        if (e.state === 'Pressed') {
          const next = !stateRef.current.isAntiTouchMode;
          stateRef.current = { ...stateRef.current, isAntiTouchMode: next, isOpen: next ? false : stateRef.current.isOpen, isPinned: next ? false : stateRef.current.isPinned };
          localStorage.setItem('drawer_anti_touch_mode', next ? 'true' : 'false');
          invoke('set_anti_touch_lock', { locked: next }).catch(() => {});
          emitTo('edge', 'anti-touch-changed', next).catch(() => {});
          setIsAntiTouchMode(next);
          if (next) enforceAntiTouchClosed(false);
          showToast(next ? '🔒 防误触已开启，抽屉已锁定' : '🔓 防误触已解除');
        }
      });

      await safeRegister(snipShortcut, (e) => {
  if (e.state === 'Pressed') {
    if (stateRef.current.isAntiTouchMode) {
      enforceAntiTouchClosed(true);
      return;
    }
    startSnip();
  }
});
      await safeRegister(textShortcut, (e) => {
        if (e.state === 'Pressed') {
           if (stateRef.current.isAntiTouchMode) {
               enforceAntiTouchClosed(true);
               return;
           }
           if (stateRef.current.showTextInput && stateRef.current.isOpen) {
               setShowTextInput(false); setIsOpen(false); setIsPinned(false);
               invoke('toggle_pin', { pinned: false }).catch(()=>{});
           } else {
               markShortcutReveal();
               flushSync(() => {
                 setShowTextInput(true);
                 setIsSearchActive(false);
                 setShowSettings(false);
                 setShowFolderModal(false);
                 setIsOpen(true);
               });
           }
        }
      });

      await safeRegister(searchShortcut, (e) => {
        if (e.state === 'Pressed') {
           if (stateRef.current.isAntiTouchMode) {
               enforceAntiTouchClosed(true);
               return;
           }
           if (stateRef.current.isSearchActive && stateRef.current.isOpen) {
               setIsSearchActive(false); setIsOpen(false); setIsPinned(false);
               invoke('toggle_pin', { pinned: false }).catch(()=>{});
           } else {
               markShortcutReveal();
               flushSync(() => {
                 setIsSearchActive(true);
                 setShowSettings(false);
                 setShowTextInput(false);
                 setShowFolderModal(false);
                 setIsOpen(true);
               });
               setTimeout(() => searchInputRef.current?.focus(), 180);
           }
        }
      });

      await safeRegister(triggerShortcut, (e) => {
        if (e.state === 'Pressed') {
          if (stateRef.current.isAntiTouchMode) {
            enforceAntiTouchClosed(true);
            return;
          }
          toggleTriggerMode();
        }
      });

      await safeRegister(noteShortcut, (e) => {
        if (e.state === 'Pressed') {
          if (stateRef.current.isAntiTouchMode) {
            enforceAntiTouchClosed(true);
            return;
          }
          createBlankFloatingNote();
        }
      });

      await safeRegister(canvasShortcut, (e) => {
        if (e.state === 'Pressed') {
          if (stateRef.current.isAntiTouchMode && !isCanvasModeRef.current) {
            enforceAntiTouchClosed(true);
            return;
          }
          if (isCanvasModeRef.current) requestExitCanvasMode();
          else enterCanvasMode();
        }
      });
    };

    setupShortcuts();

    // 🌟 核心修复：React 严格模式的清场钩子
    return () => {
      cancelled = true;
      const cleanup = async () => {
        try {
          await unregister(shortcut).catch(()=>{});
          await unregister(snipShortcut).catch(()=>{});
          await unregister(textShortcut).catch(()=>{});
          await unregister(searchShortcut).catch(()=>{});
          await unregister(triggerShortcut).catch(()=>{});
          await unregister(noteShortcut).catch(()=>{});
          await unregister(canvasShortcut).catch(()=>{});
        } catch (err) {}
      };
      cleanup();
    };
  }, [snipShortcut, shortcut, textShortcut, searchShortcut, triggerShortcut, noteShortcut, canvasShortcut]);

  useEffect(() => {
    let unlisten: () => void;
    listen('force-rescue', async () => {
      if (stateRef.current.isAntiTouchMode) {
        stateRef.current = {
          ...stateRef.current,
          isAntiTouchMode: false,
          isOpen: true,
          isPinned: false,
        };
        localStorage.setItem('drawer_anti_touch_mode', 'false');
        await invoke('set_anti_touch_lock', { locked: false }).catch(() => {});
        emitTo('edge', 'anti-touch-changed', false).catch(() => {});
        setIsAntiTouchMode(false);
      }

      startupAutoCloseSuppressedRef.current = false;
      isPointerInsideDrawerRef.current = true;
      setIsPinned(false); setIsOpen(true); setShowSettings(false);
      setShowHelp(false); setShowQR(false); setConfirmDialog(prev => ({...prev, isOpen: false}));
      setShowTextInput(false); setShowFolderModal(false); setShowUpdateLog(false);
      invoke('toggle_pin', { pinned: false }).catch(() => {});
      await invoke('open_drawer', {
        width: drawerWidthRef.current,
        height: drawerHeightRef.current,
        mode: triggerModeRef.current,
      }).catch(() => {});
    }).then(f => unlisten = f);
    return () => { if (unlisten) unlisten(); };
  }, []);


  useEffect(() => {
    let unlistenOpen: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    let unlistenStartup: (() => void) | undefined;

    const handleOpened = (fromStartup = false) => {
      if (snipModeActiveRef.current || snipExitInFlightRef.current) return;
      const isStartupPreview = fromStartup || showLaunchIntroRef.current || isSplashVisibleRef.current || showUpdateLogRef.current;
      if (stateRef.current.isAntiTouchMode && !isStartupPreview) {
        enforceAntiTouchClosed(false);
        return;
      }

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      // 不再在窗口打开事件里假定鼠标已经进入抽屉。
      // 程序自动弹出、快捷键打开、截图后弹出都可能没有真实 pointerenter。
      if (!isStartupPreview) {
        startupAutoCloseSuppressedRef.current = false;
        isPointerInsideDrawerRef.current = false;
        clearIdleAutoClose();
        idleAutoCloseTimerRef.current = window.setTimeout(() => {
          idleAutoCloseTimerRef.current = null;
          if (!isPointerInsideDrawerRef.current && !shouldBlockIdleAutoClose()) {
            setIsOpen(false);
            setIsPinned(false);
          }
        }, 3000);
      }

      setIsOpen(true);
      invoke('set_topmost', { topmost: true }).catch(() => {});
    };

    listen('drawer-opened', () => handleOpened(false)).then(f => unlistenOpen = f);
    listen('startup-preview-open', () => handleOpened(true)).then(f => unlistenStartup = f);

    listen('drawer-closed', () => {
      // 启动欢迎/更新日志弹窗还在时，不响应自动关闭事件。
      if (showLaunchIntroRef.current || isSplashVisibleRef.current || showUpdateLogRef.current) {
        setIsOpen(true);
        return;
      }

      isPointerInsideDrawerRef.current = false;
      if (!isPinnedRef.current) {
        setDrawerState('closed');
        setIsOpen(false);
      }
    }).then(f => unlistenClose = f);

    return () => {
      if (unlistenOpen) unlistenOpen();
      if (unlistenClose) unlistenClose();
      if (unlistenStartup) unlistenStartup();
    };
  }, []);

  useEffect(() => {
    let unlisten1: () => void; let unlisten2: () => void;
    listen('open-text-input', () => {
      if (stateRef.current.isAntiTouchMode) {
        enforceAntiTouchClosed(true);
        return;
      }
      if (showTextInput) { setShowTextInput(false); setIsOpen(false); }
      else { handleOpenTextInput(); setIsOpen(true); }
    }).then(f => unlisten1 = f);

    listen('open-search-bar', () => {
      if (stateRef.current.isAntiTouchMode) {
        enforceAntiTouchClosed(true);
        return;
      }
      if (isSearchActive) { setIsSearchActive(false); setIsOpen(false); }
      else { toggleSearch(); setIsOpen(true); }
    }).then(f => unlisten2 = f);
    return () => { if (unlisten1) unlisten1(); if (unlisten2) unlisten2(); };
  }, [showTextInput, isSearchActive]);

  useEffect(() => {
    if (!isOpen && !isPinned) {
      setShowSettings(false); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingText(false); setIsRecordingSearch(false); setIsRecordingTrigger(false); setIsRecordingNote(false); setIsRecordingCanvas(false);
      setShowHelp(false); setShowQR(false); setIsSelectMode(false); setSelectedIds([]); lastSelectedDrawerItemIdRef.current = null;
      setConfirmDialog(prev => ({...prev, isOpen: false})); setShowTextInput(false); setShowFolderModal(false);
      setIsSearchActive(false); setSearchQuery(''); setEditingFolderId(null); setShowUpdateLog(false);
    }
  }, [isOpen, isPinned]);

  const isGlobalMouseDown = useRef(false);
  const isPinnedRef = useRef(isPinned);
  useEffect(() => { isPinnedRef.current = isPinned; }, [isPinned]);

  useEffect(() => {
    const handleDown = () => { isGlobalMouseDown.current = true; };
    const resetPointerFlags = () => {
      previewDragActiveRef.current = false;
      isGlobalMouseDown.current = false;
      isDraggingTitleRef.current = false;
      setIsDraggingTitle(false);
    };
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('mouseup', resetPointerFlags);
    window.addEventListener('pointerup', resetPointerFlags);
    window.addEventListener('blur', resetPointerFlags);
    return () => {
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('mouseup', resetPointerFlags);
      window.removeEventListener('pointerup', resetPointerFlags);
      window.removeEventListener('blur', resetPointerFlags);
    };
  }, []);

  useEffect(() => {
    invoke('load_items').then((savedItems: any) => {
      if (savedItems && savedItems.length > 0) setItems(savedItems.map(stripHeavyDataThumbnail));
      setIsDataLoaded(true);
    }).catch(() => setIsDataLoaded(true));
    invoke('load_canvas_state').then((savedState: unknown) => {
      const restored = sanitizeCanvasPersistedState(savedState);
      canvasItemsRef.current = restored.items;
      canvasSizeRef.current = restored.size;
      canvasScaleRef.current = restored.scale;
      canvasReturnScrollRef.current = restored.scroll;
      canvasScrollLockRef.current = restored.scroll;
      setCanvasItems(restored.items);
      setCanvasSize(restored.size);
      setCanvasScale(restored.scale);
      applyCanvasScaleStyles(restored.scale, restored.size);
    }).catch((err) => {
      console.warn('恢复画布状态失败:', err);
    }).finally(() => {
      canvasStateLoadedRef.current = true;
    });
    invoke('load_folders').then((savedFolders: any) => {
      if (savedFolders && savedFolders.length > 0) {
        setFolders(savedFolders);
        localStorage.setItem(FOLDERS_CACHE_STORAGE_KEY, JSON.stringify(savedFolders));
      }
    }).catch(()=>{});
  }, []);

  const saveDrawerItemsNow = () => {
    if (!isDataLoaded) return;
    invoke('save_items', { items: itemsRef.current.map(stripHeavyDataThumbnail) }).catch(()=>{});
  };

  const scheduleDrawerItemsSave = () => {
    if (!isDataLoaded) return;
    if (drawerItemsSaveTimerRef.current !== null) {
      window.clearTimeout(drawerItemsSaveTimerRef.current);
    }
    drawerItemsSaveTimerRef.current = window.setTimeout(() => {
      drawerItemsSaveTimerRef.current = null;
      saveDrawerItemsNow();
    }, DRAWER_ITEMS_SAVE_DEBOUNCE_MS);
  };

  useEffect(() => { scheduleDrawerItemsSave(); }, [items, isDataLoaded]);
  useEffect(() => () => {
    if (drawerItemsSaveTimerRef.current !== null) {
      window.clearTimeout(drawerItemsSaveTimerRef.current);
      drawerItemsSaveTimerRef.current = null;
    }
    saveDrawerItemsNow();
  }, [isDataLoaded]);
  useEffect(() => { scheduleCanvasStateSave(); }, [canvasItems, canvasSize, canvasScale]);
  useEffect(() => () => {
    if (canvasPersistSaveTimerRef.current !== null) {
      window.clearTimeout(canvasPersistSaveTimerRef.current);
      canvasPersistSaveTimerRef.current = null;
    }
    saveCanvasStateNow();
  }, []);
  useEffect(() => {
    localStorage.setItem(FOLDERS_CACHE_STORAGE_KEY, JSON.stringify(folders));
    if (isDataLoaded) invoke('save_folders', { folders }).catch(()=>{});
  }, [folders, isDataLoaded]);
  const broadcastFloatingNoteTextUpdate = (itemId: string, content?: string, name?: string, sourceLabel?: string) => {
    const labels = readOpenFloatingNoteLabels();

    labels.forEach((label) => {
      try {
        if (sourceLabel && label === sourceLabel) return;
        const snapshot = readFloatingNoteSnapshot(label);
        if (!snapshot || snapshot.itemId !== itemId || snapshot.type !== 'text') return;

        const nextContent = typeof content === 'string' ? content : snapshot.content;
        const nextScheduleItems = typeof content === 'string' && snapshot.noteMode === 'schedule'
          ? buildScheduleItemsFromText(nextContent || '', snapshot.scheduleItems || [], {
            tagIds: getFolderTagIds(snapshot.folderId, snapshot.tagIds),
            sourceItemId: itemId,
            defaultPriority: 'B',
          })
          : snapshot.scheduleItems;
        const nextSnapshot = {
          ...snapshot,
          content: nextContent,
          name: typeof name === 'string' ? name : snapshot.name,
          scheduleItems: nextScheduleItems,
          updatedAt: Date.now(),
        };

        localStorage.setItem(floatingNoteStorageKey(label), JSON.stringify(nextSnapshot));
        const payload = {
          itemId,
          ...(typeof content === 'string' ? { content } : {}),
          ...(typeof name === 'string' ? { name } : {}),
          ...(typeof content === 'string' && snapshot.noteMode === 'schedule' ? { scheduleItems: nextScheduleItems } : {}),
          updatedAt: Date.now(),
        };
        localStorage.setItem(FLOATING_NOTE_SOURCE_BRIDGE_KEY, JSON.stringify(payload));
        emitFloatingNoteSourceUpdated(label, payload).catch(() => {});
      } catch (_) {}
    });
  };

  const broadcastFloatingNoteTitleUpdate = (itemId: string, name: string, sourceLabel?: string) => {
    const labels = readOpenFloatingNoteLabels();

    labels.forEach((label) => {
      try {
        if (sourceLabel && label === sourceLabel) return;
        const snapshot = readFloatingNoteSnapshot(label);
        if (!snapshot || snapshot.itemId !== itemId || snapshot.type !== 'text') return;

        const nextSnapshot = {
          ...snapshot,
          name,
          updatedAt: Date.now(),
        };

        localStorage.setItem(floatingNoteStorageKey(label), JSON.stringify(nextSnapshot));
        const payload = {
          itemId,
          name,
          updatedAt: Date.now(),
        };
        localStorage.setItem(FLOATING_NOTE_SOURCE_BRIDGE_KEY, JSON.stringify(payload));
        emitFloatingNoteSourceUpdated(label, payload).catch(() => {});
      } catch (_) {}
    });
  };

  const applyFloatingTextPayloadToSnapshots = (payload: any) => {
    const itemId = typeof payload?.itemId === 'string' ? payload.itemId : '';
    const hasContent = typeof payload?.content === 'string';
    const hasName = typeof payload?.name === 'string';
    const payloadScheduleItems = Array.isArray(payload?.scheduleItems)
      ? payload.scheduleItems as FloatingNoteScheduleItem[]
      : undefined;
    const payloadNoteMode = payload?.noteMode === 'schedule' || payload?.noteMode === 'text'
      ? payload.noteMode as FloatingNoteSnapshot['noteMode']
      : undefined;
    if (!itemId || (!hasContent && !hasName && !payloadScheduleItems && !payloadNoteMode)) return;

    let didUpdateSnapshot = false;
    readOpenFloatingNoteLabels().forEach((label) => {
      try {
        const snapshot = readFloatingNoteSnapshot(label);
        if (!snapshot || snapshot.itemId !== itemId || snapshot.type !== 'text') return;

        const nextContent = hasContent ? payload.content : snapshot.content;
        const nextName = hasName ? payload.name.trim() : snapshot.name;
        const nextNoteMode = payloadNoteMode || snapshot.noteMode;
        const nextScheduleItems = payloadScheduleItems || (
          hasContent && nextNoteMode === 'schedule'
            ? buildScheduleItemsFromText(nextContent || '', snapshot.scheduleItems || [], {
              tagIds: getFolderTagIds(snapshot.folderId, snapshot.tagIds),
              sourceItemId: itemId,
              defaultPriority: 'B',
            })
            : snapshot.scheduleItems
        );

        const nextSnapshot = {
          ...snapshot,
          ...(hasContent ? { content: nextContent } : {}),
          ...(hasName ? { name: nextName } : {}),
          ...(payloadNoteMode ? { noteMode: nextNoteMode } : {}),
          ...(nextScheduleItems ? { scheduleItems: nextScheduleItems } : {}),
          updatedAt: Date.now(),
        } as FloatingNoteSnapshot;

        localStorage.setItem(floatingNoteStorageKey(label), JSON.stringify(nextSnapshot));
        didUpdateSnapshot = true;
      } catch (_) {}
    });

    if (didUpdateSnapshot) refreshNoteManager();
  };

  useEffect(() => {
    let unlistenFloatingText: (() => void) | undefined;
    let unlistenFloatingTitle: (() => void) | undefined;

    const applyFloatingTextUpdate = (rawPayload: any) => {
      const payload = rawPayload || {};
      const itemId = typeof payload.itemId === 'string' ? payload.itemId : '';
      const hasContent = typeof payload.content === 'string';
      const nextText = hasContent ? payload.content : '';
      const hasName = typeof payload.name === 'string';
      const nextName = hasName ? payload.name.trim() : '';
      if (!itemId || (!hasContent && !hasName)) return;
      const textKey = `text:${itemId}:${payload.sourceLabel || ''}:${payload.updatedAt || ''}`;
      const textSeenAt = payload.updatedAt ? floatingBridgeSeenRef.current[textKey] : undefined;
      if (textSeenAt && Date.now() - textSeenAt < 4000) return;
      if (payload.updatedAt) floatingBridgeSeenRef.current[textKey] = Date.now();

      applyFloatingTextPayloadToSnapshots(payload);
      beginFloatingTextUndo(itemId, '修改便签内容');
      setItems(prev => prev.map(i => {
        if (i.id !== itemId || i.type !== 'text') return i;
        const current: any = i;
        if (!hasContent) {
          return {
            ...i,
            ...replaceFirstItemRemark(i, nextName),
          } as BufferItem;
        }

        const trimmed = nextText.trim();
        const urlLike = isProbablyUrl(trimmed);
        if (urlLike) {
          return {
            ...i,
            type: 'text',
            content: trimmed,
            name: '网址链接',
            ...(hasName ? replaceFirstItemRemark(i, nextName) : {}),
            url: trimmed,
            path: trimmed,
            isUrl: true,
          } as BufferItem;
        }

        return {
          ...i,
          type: 'text',
          content: nextText,
          name: current.isUrl || i.name === '网址链接' ? '文本片段' : i.name,
          ...(hasName ? replaceFirstItemRemark(i, nextName) : {}),
          url: undefined,
          path: undefined,
          sourceUrl: undefined,
          pageUrl: undefined,
          originalUrl: undefined,
          isUrl: false,
        } as BufferItem;
      }));

      broadcastFloatingNoteTextUpdate(itemId, hasContent ? nextText : undefined, hasName ? nextName : undefined, typeof payload.sourceLabel === 'string' ? payload.sourceLabel : undefined);
    };

    const applyFloatingTitleUpdate = (rawPayload: any) => {
      const payload = rawPayload || {};
      const itemId = typeof payload.itemId === 'string' ? payload.itemId : '';
      const nextName = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!itemId) return;
      const titleKey = `title:${itemId}:${payload.sourceLabel || ''}:${payload.updatedAt || ''}`;
      const titleSeenAt = payload.updatedAt ? floatingBridgeSeenRef.current[titleKey] : undefined;
      if (titleSeenAt && Date.now() - titleSeenAt < 4000) return;
      if (payload.updatedAt) floatingBridgeSeenRef.current[titleKey] = Date.now();

      beginFloatingTextUndo(itemId, '修改便签标题');
      setItems(prev => prev.map(i => (
        i.id === itemId && i.type === 'text'
          ? { ...i, ...replaceFirstItemRemark(i, nextName) } as BufferItem
          : i
      )));

      broadcastFloatingNoteTitleUpdate(itemId, nextName, typeof payload.sourceLabel === 'string' ? payload.sourceLabel : undefined);
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.newValue) return;
      try {
        if (event.key === FLOATING_NOTE_TEXT_BRIDGE_KEY) {
          applyFloatingTextUpdate(JSON.parse(event.newValue));
        }
        if (event.key === FLOATING_NOTE_TITLE_BRIDGE_KEY) {
          applyFloatingTitleUpdate(JSON.parse(event.newValue));
        }
      } catch (_) {}
    };

    listen('floating-note-text-updated', (event: any) => {
      applyFloatingTextUpdate(event.payload);
    }).then((fn) => { unlistenFloatingText = fn; }).catch(() => {});
    listen('floating-note-title-updated', (event: any) => {
      applyFloatingTitleUpdate(event.payload);
    }).then((fn) => { unlistenFloatingTitle = fn; }).catch(() => {});

    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
      if (unlistenFloatingText) unlistenFloatingText();
      if (unlistenFloatingTitle) unlistenFloatingTitle();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'alchemy') return;
    const pending = (items as AlchemyBufferItem[]).filter(item => isAlchemyCandidate(item) && (!item.alchemy || item.alchemy.state === 'raw'));
    if (pending.length === 0) return;
    triggerAutoPaletteForItems(pending as BufferItem[]);
  }, [activeTab, items]);
// 🌟 1. 用 Ref 缓存 activeFolderId，防止在监听器内部拿到旧的数据
  const activeFolderIdRef = useRef(activeFolderId);
  useEffect(() => { activeFolderIdRef.current = activeFolderId; }, [activeFolderId]);

  const isCanvasImageFileName = (value?: string) => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(value || '');
  const isCanvasVideoFileName = (value?: string) => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(value || '');

  const fileUrlToLocalPath = (value: string) => {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'file:') return '';
      const rawPath = decodeURIComponent(url.pathname || '');
      const normalized = rawPath.replace(/\//g, '\\');
      if (url.hostname) return `\\\\${url.hostname}${normalized}`;
      const withoutLeadingSlash = /^\\[a-zA-Z]:\\/.test(normalized) ? normalized.slice(1) : normalized;
      return withoutLeadingSlash
        .replace(/^\\\?\\(?=[a-zA-Z]:\\)/, '')
        .replace(/^\?\\(?=[a-zA-Z]:\\)/, '');
    } catch (_) {
      return '';
    }
  };

  const normalizeLocalDragPath = (value?: string | null) => {
    const raw = (value || '').trim().replace(/^"|"$/g, '');
    if (!raw) return '';
    if (/^file:/i.test(raw)) {
      return fileUrlToLocalPath(raw) || raw;
    }
    return raw
      .replace(/^\\\?\\(?=[a-zA-Z]:\\)/, '')
      .replace(/^\?\\(?=[a-zA-Z]:\\)/, '');
  };

  const isDrawerLocalDeleteCandidate = (value?: unknown) => {
    const raw = String(value || '').trim();
    if (!raw || /^data:/i.test(raw)) return false;
    if (/^https?:\/\//i.test(raw) && !raw.includes('asset.localhost')) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^file:/i.test(raw) && !/^asset:/i.test(raw) && !raw.includes('asset.localhost')) return false;
    return true;
  };

  const getDrawerImageLocalDeletePaths = (item: BufferItem) => {
    if (item.type !== 'image') return [];
    const rawItem = item as BufferItem & {
      sourcePath?: string;
      originalPath?: string;
    };
    const candidates = [
      item.path,
      item.path ? undefined : item.url,
      item.sourceUrl,
      item.originalUrl,
      rawItem.sourcePath,
      rawItem.originalPath,
    ];
    const seen = new Set<string>();

    return candidates.reduce<string[]>((paths, value) => {
      if (!isDrawerLocalDeleteCandidate(value)) return paths;
      const normalized = /^file:/i.test(String(value || '').trim())
        ? normalizeLocalDragPath(String(value))
        : String(value || '').trim();
      if (!normalized || seen.has(normalized)) return paths;
      seen.add(normalized);
      paths.push(normalized);
      return paths;
    }, []);
  };

  const deleteDrawerLocalFiles = async (paths: string[]) => {
    let deleted = 0;
    let missing = 0;
    const failed: Array<{ path: string; error: unknown }> = [];

    for (const path of Array.from(new Set(paths.filter(Boolean)))) {
      try {
        const didDelete = await invoke<boolean>('delete_local_file', { path });
        if (didDelete) deleted += 1;
        else missing += 1;
      } catch (error) {
        console.warn('删除本地文件失败:', path, error);
        failed.push({ path, error });
      }
    }

    return { deleted, missing, failed };
  };

  const removeDrawerItemsFromDrawer = (targetItems: BufferItem[], label = '删除卡片') => {
    const ids = Array.from(new Set(targetItems.map(item => item.id).filter(Boolean)));
    if (ids.length === 0) return 0;
    const idSet = new Set(ids);
    pushDrawerUndoSnapshot(label);
    setItems(prev => prev.filter(item => !idSet.has(item.id)));
    return ids.length;
  };

  const requestDeleteDrawerItems = (
    targetItems: BufferItem[],
    options: { label?: string; afterDelete?: () => void } = {}
  ) => {
    const deletableItems = targetItems.filter(item => item && !item.isQuickAccess);
    if (deletableItems.length === 0) {
      showToast('已开启星标保护，请先取消星标再删除');
      return;
    }

    const label = options.label || (deletableItems.length > 1 ? '批量删除' : '删除卡片');
    const localPaths = Array.from(new Set(deletableItems.flatMap(getDrawerImageLocalDeletePaths)));
    const imageCount = deletableItems.filter(item => item.type === 'image').length;
    const singleItem = deletableItems.length === 1 ? deletableItems[0] : null;
    const singleName = singleItem ? (singleItem.name || singleItem.content || '这张图片') : '';

    const finishDrawerDelete = (toastText: string) => {
      const removedCount = removeDrawerItemsFromDrawer(deletableItems, label);
      options.afterDelete?.();
      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      if (removedCount > 0) showToast(toastText);
    };

    const deleteDrawerOnly = () => {
      finishDrawerDelete(deletableItems.length > 1 ? `已从抽屉删除 ${deletableItems.length} 个卡片` : '已从抽屉删除');
    };

    const deleteDrawerAndLocal = async () => {
      const result = await deleteDrawerLocalFiles(localPaths);
      finishDrawerDelete(
        result.failed.length > 0
          ? `抽屉卡片已删除，本地文件 ${result.failed.length} 个删除失败`
          : `已删除抽屉卡片和 ${result.deleted} 个本地文件`
      );
    };

    if (localPaths.length > 0) {
      const message = singleItem
        ? `要删除「${singleName}」吗？可以只从抽屉移除，也可以同时删除 ${localPaths.length} 个本地文件。`
        : `要删除 ${deletableItems.length} 个卡片吗？其中 ${imageCount} 张图片可同时删除 ${localPaths.length} 个本地文件。`;
      setConfirmDialog({
        isOpen: true,
        title: singleItem ? '删除图片' : '批量删除',
        message,
        onConfirm: deleteDrawerOnly,
        actions: [
          {
            label: '只删抽屉卡片',
            onClick: deleteDrawerOnly,
            className: 'rounded-[16px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700',
          },
          {
            label: '本地也删除',
            onClick: deleteDrawerAndLocal,
            className: 'rounded-[16px] bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600',
            title: '会删除本地源文件，无法通过抽屉撤销恢复',
          },
        ],
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: singleItem?.type === 'image' ? '删除图片' : (deletableItems.length > 1 ? '批量删除' : '删除卡片'),
      message: singleItem?.type === 'image'
        ? `要从抽屉删除「${singleName}」吗？没有检测到可删除的本地文件。`
        : `确定从抽屉删除 ${deletableItems.length} 个卡片吗？`,
      onConfirm: deleteDrawerOnly,
    });
  };

  const createVideoThumbnailInWebview = (path: string) => new Promise<string>((resolve) => {
    const source = normalizeLocalDragPath(path);
    if (!source) {
      resolve('');
      return;
    }

    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const abortController = new AbortController();
    let objectUrl = '';
    let settled = false;
    const cleanup = () => {
      abortController.abort();
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = '';
      }
    };
    const finish = (value = '') => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(''), 9000);
    let candidateTimes: number[] = [];
    let candidateIndex = 0;
    let lastThumbnail = '';

    const isMostlyDarkFrame = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      try {
        const data = ctx.getImageData(0, 0, width, height).data;
        const step = Math.max(4, Math.floor(data.length / 4800) * 4);
        let sampled = 0;
        let bright = 0;
        for (let i = 0; i < data.length; i += step) {
          const alpha = data[i + 3] / 255;
          const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * alpha;
          if (luma > 28) bright += 1;
          sampled += 1;
        }
        return sampled > 0 && bright / sampled < 0.035;
      } catch (_) {
        return false;
      }
    };

    const capture = () => {
      try {
        const naturalWidth = video.videoWidth || 640;
        const naturalHeight = video.videoHeight || 360;
        const ratio = Math.min(
          VIDEO_THUMBNAIL_MAX_WIDTH / naturalWidth,
          VIDEO_THUMBNAIL_MAX_HEIGHT / naturalHeight,
          1,
        );
        const width = Math.max(1, Math.round(naturalWidth * ratio));
        const height = Math.max(1, Math.round(naturalHeight * ratio));
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          window.clearTimeout(timer);
          finish('');
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        const thumbnail = canvas.toDataURL('image/jpeg', 0.68);
        lastThumbnail = thumbnail;
        if (isMostlyDarkFrame(ctx, width, height) && candidateIndex < candidateTimes.length) {
          seekNextCandidate();
          return;
        }
        window.clearTimeout(timer);
        finish(thumbnail);
      } catch (err) {
        console.warn('浏览器视频缩略图生成失败:', err);
        window.clearTimeout(timer);
        finish(lastThumbnail);
      }
    };

    const seekNextCandidate = () => {
      const nextTime = candidateTimes[candidateIndex++];
      if (!Number.isFinite(nextTime)) {
        window.clearTimeout(timer);
        finish(lastThumbnail);
        return;
      }
      if (Math.abs(video.currentTime - nextTime) < 0.03) {
        capture();
        return;
      }
      video.currentTime = nextTime;
    };

    video.muted = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.addEventListener('error', () => {
      window.clearTimeout(timer);
      finish('');
    }, { once: true });
    video.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const rawTimes = duration > 0
        ? [1, duration * 0.12, duration * 0.25, duration * 0.5, duration * 0.75, 0.25, 0]
        : [1, 0.25, 0];
      candidateTimes = Array.from(new Set(rawTimes
        .map(value => Math.max(0, Math.min(duration || value, value)))
        .map(value => Number(value.toFixed(2)))
      ));
      seekNextCandidate();
    }, { once: true });
    video.addEventListener('seeked', capture);

    const assetUrl = convertFileSrc(source);
    const loadAssetUrlDirectly = () => {
      if (settled) return;
      video.src = assetUrl;
      video.load();
    };

    fetch(assetUrl, { method: 'HEAD', signal: abortController.signal })
      .then(response => {
        const size = Number(response.headers.get('content-length') || 0);
        if (!Number.isFinite(size) || size <= 0) {
          throw new Error('video size unknown; skip blob thumbnail fallback');
        }
        if (size > VIDEO_THUMBNAIL_BLOB_LIMIT_BYTES) {
          throw new Error(`video too large for blob thumbnail fallback: ${size}`);
        }
      })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        console.warn('视频大小探测失败或超限，尝试直接读取视频帧:', err);
        throw err;
      })
      .then(() => fetch(assetUrl, { signal: abortController.signal }))
      .then(response => response.ok ? response.blob() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(blob => {
        if (blob.size > VIDEO_THUMBNAIL_BLOB_LIMIT_BYTES) {
          throw new Error(`video too large for blob thumbnail fallback: ${blob.size}`);
        }
        if (settled) return;
        objectUrl = URL.createObjectURL(blob);
        video.src = objectUrl;
        video.load();
      })
      .catch(err => {
        if (err?.name === 'AbortError' || settled) return;
        console.warn('视频文件读取失败，回退 asset URL:', err);
        loadAssetUrlDirectly();
      });
  });

  const getVideoThumbnail = async (path: string) => {
    const source = normalizeLocalDragPath(path);
    try {
      const thumb = String(await invoke('get_video_thumb', { path: source }) || '');
      if (thumb) return thumb;
    } catch (err) {
      console.warn('FFmpeg 视频缩略图生成失败，尝试浏览器兜底:', err);
    }
    return createVideoThumbnailInWebview(source);
  };

  const createImageThumbnailInWebview = (source: string) => new Promise<string>((resolve) => {
    const rawSource = (source || '').trim();
    if (!rawSource || /^data:image\/svg/i.test(rawSource)) {
      resolve('');
      return;
    }

    const image = new window.Image();
    const canvas = document.createElement('canvas');
    let objectUrl = '';
    let settled = false;
    let timer: number | null = null;

    const cleanup = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      image.onload = null;
      image.onerror = null;
      image.removeAttribute('src');
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = '';
      }
      canvas.width = 0;
      canvas.height = 0;
    };

    const finish = (value = '') => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    image.onload = () => {
      try {
        const naturalWidth = image.naturalWidth || image.width;
        const naturalHeight = image.naturalHeight || image.height;
        if (!naturalWidth || !naturalHeight) {
          finish('');
          return;
        }

        const ratio = Math.min(
          IMAGE_THUMBNAIL_MAX_WIDTH / naturalWidth,
          IMAGE_THUMBNAIL_MAX_HEIGHT / naturalHeight,
          1,
        );
        const width = Math.max(1, Math.round(naturalWidth * ratio));
        const height = Math.max(1, Math.round(naturalHeight * ratio));
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish('');
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        finish(canvas.toDataURL('image/webp', 0.66));
      } catch (err) {
        console.warn('图片缩略图生成失败:', err);
        finish('');
      }
    };
    image.onerror = () => finish('');
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    timer = window.setTimeout(() => finish(''), 8000);

    image.src = rawSource;
  });

  const imageThumbnailInFlightRef = useRef<Set<string>>(new Set());

  const readDataImageSize = (source?: string) => new Promise<{ width: number; height: number } | null>((resolve) => {
    const rawSource = (source || '').trim();
    if (!rawSource.startsWith('data:image/')) {
      resolve(null);
      return;
    }

    const image = new window.Image();
    let settled = false;
    const finish = (value: { width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      image.removeAttribute('src');
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), 2000);

    image.onload = () => {
      window.clearTimeout(timer);
      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;
      finish(width > 0 && height > 0 ? { width, height } : null);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    image.decoding = 'async';
    image.src = rawSource;
  });

  const isLegacyImageThumbnail = async (thumbnail?: string) => {
    const size = await readDataImageSize(thumbnail);
    if (!size) return false;
    return (
      (
        size.width >= IMAGE_THUMBNAIL_LEGACY_MAX_WIDTH - 1 ||
        size.height >= IMAGE_THUMBNAIL_LEGACY_MAX_HEIGHT - 1
      ) &&
      (size.width < IMAGE_THUMBNAIL_MAX_WIDTH || size.height < IMAGE_THUMBNAIL_MAX_HEIGHT)
    );
  };

  const ensureImageThumbnail = (item: BufferItem) => {
    if (
      item.type !== 'image' ||
      item.isDirectory ||
      imageThumbnailInFlightRef.current.has(item.id)
    ) {
      return;
    }

    const source = item.url || (item.path ? convertFileSrc(item.path) : '');
    if (!source) return;

    imageThumbnailInFlightRef.current.add(item.id);
    const existingThumbnail = item.thumbnail;
    const shouldRefresh = existingThumbnail
      ? isLegacyImageThumbnail(existingThumbnail)
      : Promise.resolve(true);

    shouldRefresh
      .then((refresh) => {
        if (!refresh) return '';
        return createImageThumbnailInWebview(source);
      })
      .then(async (thumbnail) => {
        if (!thumbnail) return;
        if (existingThumbnail) {
          const [existingSize, nextSize] = await Promise.all([
            readDataImageSize(existingThumbnail),
            readDataImageSize(thumbnail),
          ]);
          if (
            existingSize &&
            nextSize &&
            nextSize.width <= existingSize.width + 8 &&
            nextSize.height <= existingSize.height + 8
          ) {
            return;
          }
        }
        setItems(prev => prev.map(current => (
          current.id === item.id && current.type === 'image' && current.thumbnail === existingThumbnail
            ? { ...current, thumbnail }
            : current
        )));
      })
      .catch((err) => console.warn('图片缩略图补全失败:', err))
      .finally(() => {
        imageThumbnailInFlightRef.current.delete(item.id);
      });
  };

  const videoThumbnailInFlightRef = useRef<Set<string>>(new Set());

  const ensureVideoThumbnail = (item: BufferItem) => {
    if (
      item.type !== 'video' ||
      !item.path ||
      item.thumbnail ||
      videoThumbnailInFlightRef.current.has(item.id)
    ) {
      return;
    }

    videoThumbnailInFlightRef.current.add(item.id);
    getVideoThumbnail(item.path).then((thumbnail) => {
      if (!thumbnail) return;
      setItems(prev => prev.map(current => (
        current.id === item.id && current.type === 'video' && !current.thumbnail
          ? { ...current, thumbnail }
          : current
      )));
    }).catch((err) => {
      console.warn('video thumbnail generation failed:', err);
    }).finally(() => {
      videoThumbnailInFlightRef.current.delete(item.id);
    });
  };

  const ensureMediaThumbnail = (item: BufferItem) => {
    if (item.type === 'image') ensureImageThumbnail(item);
    if (item.type === 'video') ensureVideoThumbnail(item);
  };

  useEffect(() => {
    const visibleIds = new Set([
      ...renderedDisplayItems.map(item => item.id),
      ...quickAccessItems.map(item => item.id),
    ]);
    const pending = items.find(item =>
      visibleIds.has(item.id) &&
      item.type === 'video' &&
      item.path &&
      !item.thumbnail &&
      !videoThumbnailInFlightRef.current.has(item.id)
    );
    if (!pending?.path) return;

    videoThumbnailInFlightRef.current.add(pending.id);
    let cancelled = false;
    getVideoThumbnail(pending.path).then((thumbnail) => {
      if (cancelled || !thumbnail) return;
      setItems(prev => prev.map(item => item.id === pending.id && !item.thumbnail ? { ...item, thumbnail } : item));
    }).catch((err) => {
      console.warn('已有视频缩略图补全失败:', err);
    }).finally(() => {
      videoThumbnailInFlightRef.current.delete(pending.id);
    });

    return () => {
      cancelled = true;
    };
  }, [items, renderedDisplayItems, quickAccessItems]);

  const thumbnailRecompressInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const pending = items.find(item =>
      (item.type === 'image' || item.type === 'video') &&
      typeof item.thumbnail === 'string' &&
      item.thumbnail.startsWith('data:image/') &&
      item.thumbnail.length > DATA_THUMBNAIL_RECOMPRESS_MIN_CHARS &&
      !thumbnailRecompressInFlightRef.current.has(item.id)
    );
    if (!pending?.thumbnail) return;

    thumbnailRecompressInFlightRef.current.add(pending.id);
    let cancelled = false;
    createImageThumbnailInWebview(pending.thumbnail)
      .then((thumbnail) => {
        if (cancelled || !thumbnail || thumbnail.length >= (pending.thumbnail?.length || 0)) return;
        setItems(prev => prev.map(item => item.id === pending.id && item.thumbnail === pending.thumbnail
          ? { ...item, thumbnail }
          : item
        ));
      })
      .catch((err) => console.warn('旧缩略图压缩失败:', err))
      .finally(() => {
        thumbnailRecompressInFlightRef.current.delete(pending.id);
      });

    return () => {
      cancelled = true;
    };
  }, [items]);

  const getCanvasLocalPathsFromDataTransfer = (dt?: DataTransfer | null) => {
    if (!dt) return [];
    const paths: string[] = [];
    const addPath = (raw?: string | null) => {
      if (!raw) return;
      const trimmed = raw.trim().replace(/^"|"$/g, '');
      if (!trimmed || trimmed.startsWith('#')) return;
      const path = /^file:/i.test(trimmed) ? fileUrlToLocalPath(trimmed) : trimmed;
      if (path && isCanvasImageFileName(path)) paths.push(path);
    };

    Array.from(dt.files || []).forEach(file => addPath((file as File & { path?: string }).path));
    Array.from(dt.items || []).forEach(item => {
      if (item.kind !== 'file') return;
      const file = item.getAsFile();
      addPath((file as (File & { path?: string }) | null)?.path);
    });

    for (const type of ['text/uri-list', 'text/plain']) {
      const data = dt.getData(type);
      if (!data) continue;
      data.split(/\r?\n/).forEach(line => addPath(line));
    }

    return Array.from(new Set(paths));
  };

  const getCanvasDropPosition = (index = 0, client?: { x: number; y: number }) => {
    const surface = canvasSurfaceRef.current;
    if (surface && client) {
      const rect = surface.getBoundingClientRect();
      const scale = canvasScaleRef.current || 1;
      return {
        x: Math.max(24, (client.x - rect.left + surface.scrollLeft) / scale - 92 + index * 22),
        y: Math.max(24, (client.y - rect.top + surface.scrollTop) / scale - 64 + index * 22),
      };
    }

    if (surface) {
      const scale = canvasScaleRef.current || 1;
      return {
        x: Math.max(24, (surface.scrollLeft + surface.clientWidth * 0.32) / scale + index * 22),
        y: Math.max(24, (surface.scrollTop + surface.clientHeight * 0.24) / scale + index * 22),
      };
    }

    return {
      x: 180 + (canvasItemsRef.current.length + index) * 26,
      y: 150 + (canvasItemsRef.current.length + index) * 22,
    };
  };

  const getCanvasPointFromClient = (clientX: number, clientY: number) => {
    const surface = canvasSurfaceRef.current;
    if (!surface) return { x: 0, y: 0 };
    const rect = surface.getBoundingClientRect();
    const scale = canvasScaleRef.current || 1;
    return {
      x: Math.max(0, (clientX - rect.left + surface.scrollLeft) / scale),
      y: Math.max(0, (clientY - rect.top + surface.scrollTop) / scale),
    };
  };

  const normalizeCanvasSelectionBox = (box: CanvasSelectionBox): CanvasItemBox => {
    const left = Math.min(box.startX, box.currentX);
    const top = Math.min(box.startY, box.currentY);
    return {
      x: left,
      y: top,
      width: Math.abs(box.currentX - box.startX),
      height: Math.abs(box.currentY - box.startY),
    };
  };

  const canvasRectsIntersect = (a: CanvasItemBox, b: CanvasItemBox) => (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );

  const getCanvasItemsBounds = (ids: string[]): CanvasItemBox | null => {
    const selected = canvasItemsRef.current.filter(item => ids.includes(item.id));
    if (selected.length === 0) return null;
    const left = Math.min(...selected.map(item => item.x));
    const top = Math.min(...selected.map(item => item.y));
    const right = Math.max(...selected.map(item => item.x + item.width));
    const bottom = Math.max(...selected.map(item => item.y + item.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  };

  const getCanvasPrimaryImageItem = (source = canvasItemsRef.current) => {
    const imageItems = source.filter(item => item.item.type === 'image');
    if (imageItems.length === 0) return null;
    return imageItems.reduce((best, item) => (
      (item.item.createdAt || 0) > (best.item.createdAt || 0) ? item : best
    ), imageItems[0]);
  };

  const getCanvasItemDisplaySource = (item: BufferItem) => (
    item.url ||
    (item.path ? convertFileSrc(item.path) : '') ||
    item.thumbnail ||
    ''
  );

  const getCanvasAiOutputDisplaySource = (output?: CanvasAiGeneratedOutput | null) => (
    output?.url ||
    (output?.path ? convertFileSrc(output.path) : '') ||
    ''
  );

  const getCanvasAiSuccessfulOutputs = (canvasItem?: CanvasImageItem | null) => (
    (isCanvasAiGeneratorType(canvasItem?.ai?.type) || canvasItem?.ai?.type === 'workflow')
      ? (canvasItem.ai.outputs || []).filter(output => output.status === 'success' && getCanvasAiOutputDisplaySource(output))
      : []
  );

  const getCanvasWorkflowAllRuntimeOutputSlots = (
    canvasItem: CanvasImageItem,
    workflow: CanvasWorkflowTemplate
  ): CanvasAiGeneratedOutput[] => {
    const drafts = createCanvasWorkflowOutputDrafts(canvasItem, workflow, undefined, 'all');
    const runtimeSnapshots = normalizeCanvasWorkflowRuntimeSnapshots(canvasItem.ai?.workflowRuntime);
    const snapshotsByTemplateId = new Map(runtimeSnapshots.map(snapshot => [snapshot.templateId, snapshot]));
    return drafts.map((draft) => {
      const nodeId = draft.nodeId || '';
      const outputIndex = Number(draft.id.split('_').pop()) || 0;
      const snapshotOutputs = snapshotsByTemplateId.get(nodeId)?.ai?.outputs;
      const output = Array.isArray(snapshotOutputs)
        ? snapshotOutputs[outputIndex] as CanvasAiGeneratedOutput | undefined
        : undefined;
      if (!output) return draft;
      return {
        ...draft,
        ...output,
        id: draft.id,
        name: output.name || draft.name,
        nodeId: draft.nodeId,
        nodeLabel: draft.nodeLabel,
      };
    });
  };

  const getCanvasAiOutputPreviewSlots = (canvasItem?: CanvasImageItem | null): CanvasAiGeneratedOutput[] => {
    if (!isCanvasAiGeneratorType(canvasItem?.ai?.type) && canvasItem?.ai?.type !== 'workflow') return [];
    const outputs = canvasItem.ai.outputs || [];
    const workflow = getCanvasWorkflowTemplateFromNode(canvasItem);
    if (workflow) {
      if (canvasItem.ai.workflowOutputMode === 'all') {
        return getCanvasWorkflowAllRuntimeOutputSlots(canvasItem, workflow);
      }
      const drafts = createCanvasWorkflowOutputDrafts(canvasItem, workflow);
      if (outputs.length === 0) return drafts;
      const usedOutputIds = new Set<string>();
      const merged = drafts.map((draft, index) => {
        const output = outputs.find(item => item.id === draft.id && !usedOutputIds.has(item.id))
          || outputs[index];
        if (!output) return draft;
        if (output.id) usedOutputIds.add(output.id);
        return {
          ...draft,
          ...output,
          id: output.id || draft.id,
          name: output.name || draft.name,
        };
      });
      const extras = outputs.filter(output => output.id && !usedOutputIds.has(output.id));
      return [...merged, ...extras];
    }
    if (outputs.length > 0) return outputs;
    const count = clamp(Math.round(Number(canvasItem.ai.count) || CANVAS_AI_DEFAULT_COUNT), 1, CANVAS_AI_MAX_OUTPUT_COUNT);
    const size = getCanvasAiOutputSize(canvasItem.ai.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO);
    return Array.from({ length: count }, (_, index) => ({
      id: `${canvasItem.id}_idle_output_${index}`,
      mediaType: getCanvasAiMediaType(canvasItem.ai),
      name: `Output #${index + 1}`,
      width: size.width,
      height: size.height,
    }));
  };

  const canUseCanvasItemAsAiInput = (canvasItem?: CanvasImageItem | null) => (
    !!canvasItem
  );

  const canUseCanvasItemAsAiTarget = (canvasItem?: CanvasImageItem | null) => (
    isCanvasAiGeneratorType(canvasItem?.ai?.type) || canvasItem?.ai?.type === 'workflow'
  );

  const hasCanvasAiGeneratedResults = (canvasItem?: CanvasImageItem | null) => (
    getCanvasAiSuccessfulOutputs(canvasItem).length > 0
  );

  const createCanvasAiOutputBufferItem = (
    canvasItem: CanvasImageItem,
    output: CanvasAiGeneratedOutput,
    index: number
  ): BufferItem | null => {
    const source = getCanvasAiOutputDisplaySource(output);
    if (!source && output.status !== 'working' && output.status !== 'error') return null;
    const mediaType = output.mediaType || getCanvasAiMediaType(canvasItem.ai);
    const titleSeed = (canvasItem.ai?.presetLabel || canvasItem.item.name || canvasItem.item.content || '').trim();
    const name = output.name || (titleSeed ? `${titleSeed} #${index + 1}` : `AI generated ${mediaType} #${index + 1}`);
    const generatedAt = output.generatedAt || canvasItem.ai?.generatedAt || canvasItem.item.createdAt || Date.now();
    const rawUrl = (output.url || source).trim();
    const rawPath = (output.path || '').trim();
    const remoteSource = /^https?:\/\//i.test(rawUrl) ? rawUrl : '';
    return {
      id: output.id || `${canvasItem.item.id}-output-${index + 1}`,
      type: mediaType,
      content: name,
      name,
      url: rawUrl,
      path: rawPath || undefined,
      sourceUrl: remoteSource || undefined,
      originalUrl: remoteSource || undefined,
      remark: output.prompt || canvasItem.ai?.prompt || canvasItem.item.content || '',
      createdAt: generatedAt,
      isQuickAccess: false,
    };
  };

  const getCanvasItemNavSource = (item: BufferItem) => (
    item.thumbnail || getCanvasItemDisplaySource(item)
  );

  const makeCanvasItemBoxMap = (ids: string[]) => (
    canvasItemsRef.current
      .filter(item => ids.includes(item.id))
      .reduce<Record<string, CanvasItemBox>>((acc, item) => {
        acc[item.id] = { x: item.x, y: item.y, width: item.width, height: item.height };
        return acc;
      }, {})
  );

  const getCanvasWorkflowGroupIdForSelection = (canvasItem?: CanvasImageItem | null) => {
    const group = canvasItem?.workflowGroup;
    if (!group || typeof group !== 'object') return '';
    return String((group as Partial<CanvasWorkflowExpandedGroup>).groupId || '');
  };

  const getCanvasWorkflowGroupItemIdsForSelection = (
    groupId: string,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => (
    groupId
      ? sourceItems
        .filter(item => getCanvasWorkflowGroupIdForSelection(item) === groupId)
        .map(item => item.id)
      : []
  );

  const isCanvasWorkflowGroupInSingleEdit = (groupId?: string | null) => (
    !!groupId && canvasWorkflowSingleEditGroupIdsRef.current.has(groupId)
  );

  const expandCanvasSelectionIdsWithWorkflowGroups = (
    ids: string[],
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => {
    const expanded = new Set(ids.filter(Boolean));
    ids.forEach(id => {
      const item = sourceItems.find(canvasItem => canvasItem.id === id);
      const groupId = getCanvasWorkflowGroupIdForSelection(item);
      if (!groupId || isCanvasWorkflowGroupInSingleEdit(groupId)) return;
      getCanvasWorkflowGroupItemIdsForSelection(groupId, sourceItems).forEach(groupItemId => {
        expanded.add(groupItemId);
      });
    });
    return Array.from(expanded);
  };

  const getCanvasWorkflowSelectionIdsForItem = (
    id: string,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => expandCanvasSelectionIdsWithWorkflowGroups([id], sourceItems);

  const setCanvasSelectionWithoutWorkflowExpansion = (ids: string[]) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    canvasSelectedIdsRef.current = unique;
    setCanvasSelectedIds(unique);
  };

  const updateCanvasSelection = (ids: string[]) => {
    const unique = Array.from(new Set(expandCanvasSelectionIdsWithWorkflowGroups(ids)));
    canvasSelectedIdsRef.current = unique;
    setCanvasSelectedIds(unique);
  };

  const enableCanvasWorkflowSingleEditForItem = (id: string) => {
    const item = canvasItemsRef.current.find(canvasItem => canvasItem.id === id);
    const groupId = getCanvasWorkflowGroupIdForSelection(item);
    if (!groupId) return false;
    if (!canvasWorkflowSingleEditGroupIdsRef.current.has(groupId)) {
      canvasWorkflowSingleEditGroupIdsRef.current.add(groupId);
      setCanvasWorkflowSingleEditGroupIds(prev => prev.includes(groupId) ? prev : [...prev, groupId]);
      showToast('已进入工作流单节点编辑：可单独移动、删除内部节点');
    } else {
      showToast('当前工作流已处于单节点编辑模式');
    }
    setCanvasSelectionWithoutWorkflowExpansion([id]);
    return true;
  };

  const updateCanvasItemsImmediate = (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => {
    if (canvasItemsCommitFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasItemsCommitFrameRef.current);
      canvasItemsCommitFrameRef.current = null;
    }
    pendingCanvasItemsCommitRef.current = null;
    const next = updater(canvasItemsRef.current);
    canvasItemsRef.current = next;
    setCanvasItems(next);
    return next;
  };

  const updateCanvasItemsInFrame = (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => {
    const next = updater(canvasItemsRef.current);
    canvasItemsRef.current = next;
    pendingCanvasItemsCommitRef.current = next;
    if (canvasItemsCommitFrameRef.current === null) {
      canvasItemsCommitFrameRef.current = window.requestAnimationFrame(() => {
        canvasItemsCommitFrameRef.current = null;
        const pending = pendingCanvasItemsCommitRef.current;
        pendingCanvasItemsCommitRef.current = null;
        if (pending) setCanvasItems(pending);
      });
    }
    return next;
  };

  const buildCanvasPersistedState = (): CanvasPersistedState => ({
    items: canvasItemsRef.current.map(stripCanvasItemDataImageProvenance),
    size: cloneDrawerValue(canvasSizeRef.current),
    scale: clamp(canvasScaleRef.current || 1, CANVAS_MIN_SCALE, CANVAS_MAX_SCALE),
    scroll: cloneDrawerValue(
      canvasSurfaceRef.current
        ? {
          left: canvasSurfaceRef.current.scrollLeft,
          top: canvasSurfaceRef.current.scrollTop,
        }
        : canvasScrollLockRef.current ||
      canvasReturnScrollRef.current ||
      {
        left: 0,
        top: 0,
      }
    ),
    updatedAt: Date.now(),
  });

  const saveCanvasStateNow = () => {
    if (!canvasStateLoadedRef.current) return;
    const state = buildCanvasPersistedState();
    invoke('save_canvas_state', { state }).catch((err) => {
      console.warn('保存画布状态失败:', err);
    });
  };

  const scheduleCanvasStateSave = () => {
    if (!canvasStateLoadedRef.current) return;
    if (canvasPersistSaveTimerRef.current !== null) {
      window.clearTimeout(canvasPersistSaveTimerRef.current);
    }
    canvasPersistSaveTimerRef.current = window.setTimeout(() => {
      canvasPersistSaveTimerRef.current = null;
      saveCanvasStateNow();
    }, CANVAS_STATE_SAVE_DEBOUNCE_MS);
  };

  const flushCanvasItemsInFrame = () => {
    if (canvasItemsCommitFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasItemsCommitFrameRef.current);
      canvasItemsCommitFrameRef.current = null;
    }
    const pending = pendingCanvasItemsCommitRef.current;
    pendingCanvasItemsCommitRef.current = null;
    if (pending) setCanvasItems(pending);
  };

  function applyCanvasScaleStyles(
    scale = canvasScaleRef.current || 1,
    size = canvasSizeRef.current
  ) {
    const sizer = canvasSizerRef.current;
    if (sizer) {
      sizer.style.width = `${size.width * scale}px`;
      sizer.style.height = `${size.height * scale}px`;
    }

    const content = canvasContentRef.current;
    if (content) {
      content.style.width = `${size.width}px`;
      content.style.height = `${size.height}px`;
      content.style.transform = `scale(${scale})`;
    }
  }

  const commitCanvasScaleSoon = () => {
    if (canvasScaleCommitTimerRef.current !== null) {
      window.clearTimeout(canvasScaleCommitTimerRef.current);
    }

    canvasScaleCommitTimerRef.current = window.setTimeout(() => {
      canvasScaleCommitTimerRef.current = null;
      setCanvasScale(canvasScaleRef.current || 1);
    }, 90);
  };

  const setCanvasSizeImmediate = (nextSize: { width: number; height: number }) => {
    const current = canvasSizeRef.current;
    if (current.width === nextSize.width && current.height === nextSize.height) return;
    canvasSizeRef.current = nextSize;
    applyCanvasScaleStyles(canvasScaleRef.current || 1, nextSize);
    setCanvasSize(nextSize);
  };

  const growCanvasToFit = (right: number, bottom: number) => {
    const current = canvasSizeRef.current;
    const targetWidth = Math.max(current.width, Math.ceil((right + CANVAS_GROW_CHUNK * 0.45) / CANVAS_GROW_CHUNK) * CANVAS_GROW_CHUNK);
    const targetHeight = Math.max(current.height, Math.ceil((bottom + CANVAS_GROW_CHUNK * 0.45) / CANVAS_GROW_CHUNK) * CANVAS_GROW_CHUNK);
    if (targetWidth !== current.width || targetHeight !== current.height) {
      setCanvasSizeImmediate({ width: targetWidth, height: targetHeight });
    }
  };

  const clearCanvasUndoStack = () => {
    canvasUndoStackRef.current = [];
    canvasUndoRestoringRef.current = false;
  };

  const takeCanvasUndoSnapshot = (label: string): CanvasUndoSnapshot => {
    const surface = canvasSurfaceRef.current;
    return {
      items: cloneDrawerValue(canvasItemsRef.current.map(stripCanvasItemDataImageProvenance)),
      selectedIds: cloneDrawerValue(canvasSelectedIdsRef.current),
      size: cloneDrawerValue(canvasSizeRef.current),
      scroll: {
        left: surface?.scrollLeft ?? 0,
        top: surface?.scrollTop ?? 0,
      },
      label,
      createdAt: Date.now(),
    };
  };

  const pushCanvasUndoSnapshot = (label: string) => {
    if (canvasUndoRestoringRef.current || !isCanvasModeRef.current) return;
    canvasUndoStackRef.current = [
      ...canvasUndoStackRef.current,
      takeCanvasUndoSnapshot(label),
    ].slice(-CANVAS_UNDO_LIMIT);
  };

  const restoreCanvasUndoSnapshot = (snapshot: CanvasUndoSnapshot) => {
    canvasUndoRestoringRef.current = true;
    setCanvasSizeImmediate(cloneDrawerValue(snapshot.size));
    updateCanvasItemsImmediate(() => cloneDrawerValue(snapshot.items));
    updateCanvasSelection(cloneDrawerValue(snapshot.selectedIds));
    setCanvasSelectionBox(null);
    canvasScrollLockRef.current = cloneDrawerValue(snapshot.scroll);
    window.requestAnimationFrame(() => {
      if (!isCanvasModeRef.current) return;
      const surface = canvasSurfaceRef.current;
      if (surface) writeCanvasSurfaceScroll(surface, snapshot.scroll.left, snapshot.scroll.top);
    });
    window.setTimeout(() => {
      canvasUndoRestoringRef.current = false;
    }, 0);
  };

  const undoLastCanvasChange = () => {
    const snapshot = canvasUndoStackRef.current.pop();
    if (!snapshot) return false;
    restoreCanvasUndoSnapshot(snapshot);
    showToast(`已撤回：${snapshot.label}`);
    return true;
  };

  const appendCanvasItems = (nextItems: CanvasImageItem[], label: string, select = true) => {
    if (!isCanvasModeRef.current) return 0;
    const clean = nextItems.filter(Boolean);
    if (clean.length === 0) return 0;
    pushCanvasUndoSnapshot(label);
    growCanvasToFit(
      Math.max(...clean.map(item => item.x + item.width)),
      Math.max(...clean.map(item => item.y + item.height))
    );
    updateCanvasItemsImmediate(prev => [...prev, ...clean]);
    if (select) {
      updateCanvasSelection(clean.map(item => item.id));
      scheduleCanvasFocusItemById(clean[0].id);
    }
    return clean.length;
  };

  const removeCanvasItemsByIds = (ids: string[], label = '删除画布元素') => {
    if (!isCanvasModeRef.current) return 0;
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return 0;
    const idSet = new Set(uniqueIds);
    pushCanvasUndoSnapshot(label);
    updateCanvasItemsImmediate(prev => prev
      .filter(item => !idSet.has(item.id))
      .map(item => item.inputs?.some(inputId => idSet.has(inputId))
        ? { ...item, inputs: item.inputs.filter(inputId => !idSet.has(inputId)) }
        : item));
    updateCanvasSelection(canvasSelectedIdsRef.current.filter(selectedId => !idSet.has(selectedId)));
    return uniqueIds.length;
  };

  const getCanvasBoundsFromItems = (sourceItems: CanvasImageItem[]): CanvasItemBox | null => {
    if (sourceItems.length === 0) return null;
    const left = Math.min(...sourceItems.map(item => item.x));
    const top = Math.min(...sourceItems.map(item => item.y));
    const right = Math.max(...sourceItems.map(item => item.x + item.width));
    const bottom = Math.max(...sourceItems.map(item => item.y + item.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  };

  const organizeCanvasItems = (ids?: string[]) => {
    if (!isCanvasModeRef.current) return 0;
    const sourceItems = canvasItemsRef.current;
    const selectedIds = canvasSelectedIdsRef.current;
    const requestedIds = ids?.length
      ? ids
      : (selectedIds.length > 1 ? selectedIds : sourceItems.map(item => item.id));
    const existingIds = new Set(sourceItems.map(item => item.id));
    const targetIds = Array.from(new Set(requestedIds.filter(id => existingIds.has(id))));
    const targetIdSet = new Set(targetIds);
    const targetItems = sourceItems.filter(item => targetIdSet.has(item.id));

    if (targetItems.length < 2) {
      showToast(targetItems.length === 0 ? '画布里还没有可整理的元素' : '至少需要 2 个元素才能整理');
      return 0;
    }

    const bounds = getCanvasBoundsFromItems(targetItems);
    const snap = (value: number) => Math.max(24, Math.round(value / 8) * 8);
    const startX = snap(Math.max(72, bounds?.x ?? 120));
    const startY = snap(Math.max(72, bounds?.y ?? 120));
    const sortedItems = [...targetItems].sort((a, b) => (
      a.y - b.y ||
      a.x - b.x ||
      (a.item.createdAt || 0) - (b.item.createdAt || 0)
    ));
    const originalOrder = new Map(sortedItems.map((item, index) => [item.id, index]));
    const itemById = new Map(sortedItems.map(item => [item.id, item]));
    const placements = new Map<string, { x: number; y: number }>();
    const hasInternalLinks = sortedItems.some(item => (item.inputs || []).some(inputId => targetIdSet.has(inputId)));
    const columnGap = 104;
    const rowGap = 46;

    if (hasInternalLinks) {
      const levelMemo = new Map<string, number>();
      const visiting = new Set<string>();
      const getLevel = (item: CanvasImageItem): number => {
        const memo = levelMemo.get(item.id);
        if (memo !== undefined) return memo;
        if (visiting.has(item.id)) return 0;
        visiting.add(item.id);
        const parents = (item.inputs || [])
          .map(inputId => itemById.get(inputId))
          .filter((input): input is CanvasImageItem => !!input);
        const level = parents.length > 0
          ? Math.max(...parents.map(parent => getLevel(parent))) + 1
          : 0;
        visiting.delete(item.id);
        levelMemo.set(item.id, level);
        return level;
      };

      const grouped = new Map<number, CanvasImageItem[]>();
      sortedItems.forEach(item => {
        const level = getLevel(item);
        grouped.set(level, [...(grouped.get(level) || []), item]);
      });

      let xCursor = startX;
      Array.from(grouped.keys()).sort((a, b) => a - b).forEach(level => {
        const column = [...(grouped.get(level) || [])].sort((a, b) => (
          (originalOrder.get(a.id) || 0) - (originalOrder.get(b.id) || 0)
        ));
        const columnWidth = Math.max(...column.map(item => item.width));
        let yCursor = startY;

        column.forEach(item => {
          const parentCenters = (item.inputs || [])
            .map(inputId => {
              const parent = itemById.get(inputId);
              const parentPos = placements.get(inputId);
              return parent && parentPos ? parentPos.y + parent.height / 2 : null;
            })
            .filter((center): center is number => center !== null);
          const parentAlignedY = parentCenters.length > 0
            ? parentCenters.reduce((sum, center) => sum + center, 0) / parentCenters.length - item.height / 2
            : null;
          const y = snap(parentAlignedY === null ? yCursor : Math.max(yCursor, parentAlignedY));
          placements.set(item.id, { x: snap(xCursor), y });
          yCursor = y + item.height + rowGap;
        });

        xCursor += columnWidth + columnGap;
      });
    } else {
      const maxWidth = Math.max(...sortedItems.map(item => item.width));
      const maxHeight = Math.max(...sortedItems.map(item => item.height));
      const columnCount = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(sortedItems.length * 1.35))));
      const cellWidth = maxWidth + 56;
      const cellHeight = maxHeight + 56;

      sortedItems.forEach((item, index) => {
        const column = index % columnCount;
        const row = Math.floor(index / columnCount);
        placements.set(item.id, {
          x: snap(startX + column * cellWidth),
          y: snap(startY + row * cellHeight),
        });
      });
    }

    const arrangedIds = sortedItems.map(item => item.id);
    const arrangedBoxes = sortedItems.map(item => {
      const pos = placements.get(item.id) || { x: item.x, y: item.y };
      return { ...item, x: pos.x, y: pos.y };
    });
    const arrangedBounds = getCanvasBoundsFromItems(arrangedBoxes);
    const previousSelection = [...selectedIds];

    pushCanvasUndoSnapshot('一键整理画布');
    updateCanvasItemsImmediate(prev => prev.map(item => {
      const pos = placements.get(item.id);
      return pos ? { ...item, x: pos.x, y: pos.y } : item;
    }));
    setCanvasSelectionBox(null);
    if (selectedIds.length > 1 || ids?.length) {
      updateCanvasSelection(arrangedIds);
    } else {
      updateCanvasSelection(previousSelection.filter(id => existingIds.has(id)));
    }
    if (arrangedBounds) {
      growCanvasToFit(arrangedBounds.x + arrangedBounds.width + 160, arrangedBounds.y + arrangedBounds.height + 160);
    }
    window.requestAnimationFrame(() => {
      fitCanvasViewToItems(arrangedIds);
    });
    showToast(`已整理 ${targetItems.length} 个画布元素`);
    return targetItems.length;
  };

  const removeCanvasConnection = (targetId: string, sourceId: string, label = '删除连接线') => {
    if (!targetId || !sourceId) return false;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target?.inputs?.includes(sourceId)) return false;
    pushCanvasUndoSnapshot(label);
    updateCanvasItemsImmediate(prev => prev.map(item => (
      item.id === targetId
        ? { ...item, inputs: (item.inputs || []).filter(inputId => inputId !== sourceId) }
        : item
    )));
    return true;
  };

  const createCanvasContextMenuState = (
    event: { clientX: number; clientY: number },
    type: CanvasContextMenuState['type'],
    patch: Partial<CanvasContextMenuState> = {}
  ): CanvasContextMenuState => {
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    return {
      x: event.clientX,
      y: event.clientY,
      worldX: point.x,
      worldY: point.y,
      type,
      ...patch,
    };
  };

  const openCanvasContextMenu = (
    event: React.MouseEvent,
    type: CanvasContextMenuState['type'],
    patch: Partial<CanvasContextMenuState> = {}
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setCanvasContextMenu(createCanvasContextMenuState(event, type, patch));
  };

  const openCanvasCreateMenu = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-canvas-item-id], [data-no-drag="true"], textarea, input, button, select, [contenteditable="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasContextMenu(createCanvasContextMenuState(event, 'canvas'));
  };

  const getCanvasActionIds = (itemId?: string) => {
    const selectedIds = canvasSelectedIdsRef.current;
    if (itemId && selectedIds.includes(itemId)) return selectedIds;
    if (itemId) return [itemId];
    return selectedIds;
  };

  const copyCanvasItems = (ids = canvasSelectedIdsRef.current) => {
    const idSet = new Set(ids.filter(Boolean));
    const copied = canvasItemsRef.current.filter(item => idSet.has(item.id));
    if (copied.length === 0) return 0;
    canvasClipboardRef.current = cloneDrawerValue(copied);
    showToast(`已复制 ${copied.length} 个画布元素`);
    return copied.length;
  };

  const pasteCanvasItems = (client?: { x: number; y: number }, label = '粘贴画布元素') => {
    if (!isCanvasModeRef.current) return 0;
    const sourceItems = cloneDrawerValue(canvasClipboardRef.current || []);
    const sourceBounds = getCanvasBoundsFromItems(sourceItems);
    if (sourceItems.length === 0 || !sourceBounds) return 0;

    const targetPoint = client ? getCanvasPointFromClient(client.x, client.y) : null;
    const offsetX = targetPoint ? targetPoint.x - sourceBounds.x : CANVAS_PASTE_OFFSET;
    const offsetY = targetPoint ? targetPoint.y - sourceBounds.y : CANVAS_PASTE_OFFSET;
    const idMap = new Map<string, string>();

    const nextItems = sourceItems.map((sourceItem, index) => {
      const nextBufferId = Math.random().toString(36).substring(2, 9);
      const nextCanvasId = sourceItem.id.startsWith('canvas_ai_') ? `canvas_ai_${nextBufferId}` : `canvas_${nextBufferId}`;
      idMap.set(sourceItem.id, nextCanvasId);
      const nextItem: CanvasImageItem = {
        ...cloneDrawerValue(sourceItem),
        id: nextCanvasId,
        x: Math.max(24, sourceItem.x + offsetX + (targetPoint ? 0 : index * 6)),
        y: Math.max(24, sourceItem.y + offsetY + (targetPoint ? 0 : index * 6)),
        item: {
          ...cloneDrawerValue(sourceItem.item),
          id: nextBufferId,
          createdAt: Date.now() + index,
        },
        ai: sourceItem.ai ? {
          ...cloneDrawerValue(sourceItem.ai),
          status: isCanvasAiGeneratorType(sourceItem.ai.type) ? 'idle' : sourceItem.ai.status,
          error: undefined,
        } : undefined,
      };
      return nextItem;
    });

    const remappedItems = nextItems.map(item => ({
      ...item,
      inputs: (item.inputs || [])
        .map(inputId => idMap.get(inputId))
        .filter((inputId): inputId is string => !!inputId),
    }));

    const addedCount = appendCanvasItems(remappedItems, label);
    if (addedCount > 0) showToast(`已粘贴 ${addedCount} 个画布元素`);
    return addedCount;
  };

  const duplicateCanvasItems = (ids = canvasSelectedIdsRef.current, client?: { x: number; y: number }) => {
    if (copyCanvasItems(ids) === 0) return 0;
    return pasteCanvasItems(client, '复制画布元素');
  };

  const shiftCanvasWorld = (deltaX: number, deltaY: number) => {
    if (deltaX === 0 && deltaY === 0) return;

    updateCanvasItemsImmediate(prev => prev.map(item => ({
      ...item,
      x: item.x + deltaX,
      y: item.y + deltaY,
    })));

    const drag = canvasDragRef.current;
    if (drag) {
      Object.values(drag.startItems).forEach(item => {
        item.x += deltaX;
        item.y += deltaY;
      });
      const scale = canvasScaleRef.current || 1;
      drag.startScrollLeft += deltaX * scale;
      drag.startScrollTop += deltaY * scale;
    }

    const resize = canvasResizeRef.current;
    if (resize) {
      resize.startX += deltaX;
      resize.startY += deltaY;
    }

    const groupResize = canvasGroupResizeRef.current;
    if (groupResize) {
      groupResize.startBounds.x += deltaX;
      groupResize.startBounds.y += deltaY;
      Object.values(groupResize.startItems).forEach(item => {
        item.x += deltaX;
        item.y += deltaY;
      });
    }

    const selection = canvasSelectionDragRef.current;
    if (selection) {
      selection.startX += deltaX;
      selection.startY += deltaY;
    }

    setCanvasSelectionBox(box => box
      ? {
        startX: box.startX + deltaX,
        startY: box.startY + deltaY,
        currentX: box.currentX + deltaX,
        currentY: box.currentY + deltaY,
      }
      : box
    );
  };

  const expandCanvasBeforeViewport = (left: number, top: number) => {
    if (left <= 0 && top <= 0) return;
    const current = canvasSizeRef.current;
    setCanvasSizeImmediate({
      width: current.width + left,
      height: current.height + top,
    });
    shiftCanvasWorld(left, top);

    const surface = canvasSurfaceRef.current;
    if (surface) {
      const scale = canvasScaleRef.current || 1;
      const pan = canvasPanRef.current;
      if (pan) {
        pan.startScrollLeft += left * scale;
        pan.startScrollTop += top * scale;
      }
      writeCanvasSurfaceScroll(surface, surface.scrollLeft + left * scale, surface.scrollTop + top * scale);
    }
  };

  const autoScrollCanvasNearEdge = (event: { clientX: number; clientY: number }) => {
    const surface = canvasSurfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const getEdgeDelta = (position: number, start: number, end: number) => {
      const maxDelta = CANVAS_EDGE_AUTOSCROLL_SPEED * 0.42;
      if (position > end - CANVAS_EDGE_AUTOSCROLL_MARGIN) {
        const intensity = clamp((position - (end - CANVAS_EDGE_AUTOSCROLL_MARGIN)) / CANVAS_EDGE_AUTOSCROLL_MARGIN, 0, 1);
        return maxDelta * intensity * intensity;
      }
      if (position < start + CANVAS_EDGE_AUTOSCROLL_MARGIN) {
        const intensity = clamp(((start + CANVAS_EDGE_AUTOSCROLL_MARGIN) - position) / CANVAS_EDGE_AUTOSCROLL_MARGIN, 0, 1);
        return -maxDelta * intensity * intensity;
      }
      return 0;
    };

    const deltaX = getEdgeDelta(event.clientX, rect.left, rect.right);
    const deltaY = getEdgeDelta(event.clientY, rect.top, rect.bottom);

    if (deltaX === 0 && deltaY === 0) return;

    const scale = canvasScaleRef.current || 1;
    const growLeft = deltaX < 0 && surface.scrollLeft < Math.abs(deltaX) * 1.5 ? CANVAS_GROW_CHUNK : 0;
    const growTop = deltaY < 0 && surface.scrollTop < Math.abs(deltaY) * 1.5 ? CANVAS_GROW_CHUNK : 0;
    if (growLeft || growTop) expandCanvasBeforeViewport(growLeft, growTop);

    const nextLeft = Math.max(0, surface.scrollLeft + deltaX);
    const nextTop = Math.max(0, surface.scrollTop + deltaY);
    const visibleRight = (nextLeft + surface.clientWidth) / scale;
    const visibleBottom = (nextTop + surface.clientHeight) / scale;
    growCanvasToFit(visibleRight + CANVAS_GROW_CHUNK * 0.8, visibleBottom + CANVAS_GROW_CHUNK * 0.8);
    writeCanvasSurfaceScroll(surface, nextLeft, nextTop);
  };

  const createCanvasImageItemFromPath = async (originalPath: string, index = 0, client?: { x: number; y: number }): Promise<CanvasImageItem | null> => {
    let path = originalPath;
    let fileName = path.split(/[\\/]/).pop() || '画布图片';

    let kind: 'file' | 'directory' | 'missing' = 'file';
    try {
      kind = await invoke<'file' | 'directory' | 'missing'>('path_kind', { path });
    } catch (_) {
      kind = 'file';
    }
    if (kind !== 'file' || !isCanvasImageFileName(fileName)) return null;

    const originalSourcePath = path;
    const latestCacheDir = await getLatestFileCacheDir();
    try {
      const cachedPath = await invoke<string>('cache_local_file_to_dir', {
        path,
        dir: latestCacheDir || undefined,
      });
      if (cachedPath) {
        path = cachedPath;
        fileName = path.split(/[\\/]/).pop() || fileName;
      }
    } catch (err) {
      console.warn('画布图片缓存失败，保留原路径:', err);
    }

    const item: BufferItem = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'image',
      content: fileName,
      name: fileName,
      path,
      url: convertFileSrc(path),
      sourceUrl: originalSourcePath !== path ? originalSourcePath : undefined,
      originalUrl: originalSourcePath !== path ? originalSourcePath : undefined,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const pos = getCanvasDropPosition(index, client);
    const size = await readImageDisplaySize(item.url || (item.path ? convertFileSrc(item.path) : ''));
    return {
      id: `canvas_${item.id}`,
      item,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    };
  };

  const createCanvasVideoItemFromPath = async (originalPath: string, index = 0, client?: { x: number; y: number }): Promise<CanvasImageItem | null> => {
    let path = originalPath;
    let fileName = path.split(/[\\/]/).pop() || '画布视频';

    let kind: 'file' | 'directory' | 'missing' = 'file';
    try {
      kind = await invoke<'file' | 'directory' | 'missing'>('path_kind', { path });
    } catch (_) {
      kind = 'file';
    }
    if (kind !== 'file' || !isCanvasVideoFileName(fileName)) return null;

    const originalSourcePath = path;
    const latestCacheDir = await getLatestFileCacheDir();
    try {
      const cachedPath = await invoke<string>('cache_local_file_to_dir', {
        path,
        dir: latestCacheDir || undefined,
      });
      if (cachedPath) {
        path = cachedPath;
        fileName = path.split(/[\\/]/).pop() || fileName;
      }
    } catch (err) {
      console.warn('画布视频缓存失败，保留原路径:', err);
    }

    let thumbnail = '';
    try {
      thumbnail = await getVideoThumbnail(path);
    } catch (err) {
      console.warn('画布视频缩略图生成失败:', err);
    }

    const item: BufferItem = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'video',
      content: fileName,
      name: fileName,
      path,
      url: convertFileSrc(path),
      thumbnail: thumbnail || undefined,
      sourceUrl: originalSourcePath !== path ? originalSourcePath : undefined,
      originalUrl: originalSourcePath !== path ? originalSourcePath : undefined,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const pos = getCanvasDropPosition(index, client);
    const size = thumbnail
      ? await readImageDisplaySize(thumbnail)
      : { width: 320, height: 180 };
    return {
      id: `canvas_${item.id}`,
      item,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    };
  };

  const addCanvasImageItems = (nextItems: CanvasImageItem[]) => {
    const addedCount = appendCanvasItems(nextItems, '添加素材到画布');
    if (addedCount > 0) showToast(`已添加 ${addedCount} 个素材到无限画布`);
  };

  const addCanvasTextItem = (client?: { x: number; y: number }) => {
    const pos = getCanvasDropPosition(0, client);
    const item: BufferItem = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'text',
      content: '',
      name: '文字卡片',
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const canvasId = `canvas_${item.id}`;
    const canvasItem = {
      id: canvasId,
      item,
      x: pos.x,
      y: pos.y,
      width: 240,
      height: 160,
    };
    if (appendCanvasItems([canvasItem], '新增文字卡片') > 0) {
      showToast('已添加文字卡片');
    }
  };

  const addCanvasTextItemAtWorld = (world: { x: number; y: number }) => {
    const item: BufferItem = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'text',
      content: '',
      name: '文字卡片',
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const canvasItem = {
      id: `canvas_${item.id}`,
      item,
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
      width: 240,
      height: 160,
    };
    if (appendCanvasItems([canvasItem], '新增文字卡片') > 0) {
      showToast('已添加文字卡片');
    }
  };

  const createCanvasTextItemFromContent = (content: string, index = 0, client?: { x: number; y: number }): CanvasImageItem | null => {
    const normalized = String(content || '').replace(/\r\n?/g, '\n').trimEnd();
    if (!normalized.trim()) return null;
    const title = normalized.trim().split(/\n/)[0]?.slice(0, 32) || '剪贴板文字';
    const lines = normalized.split('\n');
    const longestLine = Math.max(4, ...lines.map(line => Array.from(line).length));
    const pos = getCanvasDropPosition(index, client);
    const item: BufferItem = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'text',
      content: normalized,
      name: title,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    return {
      id: `canvas_${item.id}`,
      item,
      x: pos.x,
      y: pos.y,
      width: clamp(longestLine * 7 + 56, 220, 420),
      height: clamp(lines.length * 20 + 84, 130, 360),
    };
  };

  const getCanvasClipboardImageFiles = (clipboardData: DataTransfer) => {
    const files = Array.from(clipboardData.files || []).filter(file => (
      file.type.startsWith('image/') || isCanvasImageFileName(file.name)
    ));
    if (files.length > 0) return files;

    return Array.from(clipboardData.items || [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => !!file);
  };

  const pasteSystemClipboardToCanvas = async (clipboardData: DataTransfer, client?: { x: number; y: number }) => {
    const imageFiles = getCanvasClipboardImageFiles(clipboardData);
    const text = clipboardData.getData('text/plain') || '';
    if (imageFiles.length === 0 && !text.trim()) return false;

    const createdImages = await Promise.all(imageFiles.map((file, index) => createCanvasImageItemFromFile(file, index, client)));
    const images = createdImages.filter((item): item is CanvasImageItem => !!item);
    const textItem = createCanvasTextItemFromContent(text, images.length, client);
    const nextItems = textItem ? [...images, textItem] : images;
    if (nextItems.length === 0) return false;

    const addedCount = appendCanvasItems(nextItems, '粘贴剪贴板内容');
    if (addedCount > 0) {
      const parts = [
        images.length > 0 ? `${images.length} 张图片` : '',
        textItem ? '1 段文字' : '',
      ].filter(Boolean).join('、');
      showToast(`已粘贴${parts ? ` ${parts}` : '剪贴板内容'}到画布`);
    }
    return addedCount > 0;
  };

  const updateCanvasTextItem = (canvasId: string, content: string) => {
    updateCanvasItemsImmediate(prev => prev.map(canvasItem => (
      canvasItem.id === canvasId
        ? {
          ...canvasItem,
          item: {
            ...canvasItem.item,
            content,
            name: content.trim().split(/\r?\n/)[0]?.slice(0, 24) || '文字卡片',
          },
        }
        : canvasItem
    )));
  };

  const createCanvasImageItemFromFile = (file: File, index = 0, client?: { x: number; y: number }) => new Promise<CanvasImageItem | null>((resolve) => {
    if (!file.type.startsWith('image/') && !isCanvasImageFileName(file.name)) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      if (!url) {
        resolve(null);
        return;
      }
      const item: BufferItem = {
        id: Math.random().toString(36).substring(2, 9),
        type: 'image',
        content: file.name || '画布图片',
        name: file.name || '画布图片',
        url,
        path: url,
        createdAt: Date.now(),
        isQuickAccess: false,
      };
      const pos = getCanvasDropPosition(index, client);
      const size = await readImageDisplaySize(url);
      resolve({
        id: `canvas_${item.id}`,
        item,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

  const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });

  const isRemoteHttpImageSource = (source?: string | null) => {
    const value = String(source || '').trim();
    return /^https?:\/\//i.test(value) && !/asset\.localhost|localhost|127\.0\.0\.1/i.test(value);
  };

  const getDataUrlByteSize = (dataUrl: string) => {
    const commaIndex = dataUrl.indexOf(',');
    const payload = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
    return Math.ceil(payload.length * 0.75);
  };

  const optimizeCanvasAiInputDataUrl = (dataUrl: string) => new Promise<string>((resolve) => {
    if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUrl)) {
      resolve(dataUrl);
      return;
    }
    const image = new window.Image();
    image.onload = () => {
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      if (!naturalWidth || !naturalHeight) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      const originalBytes = getDataUrlByteSize(dataUrl);
      const candidates: string[] = [];
      const maxEdges = Array.from(new Set([
        Math.min(CANVAS_AI_INPUT_IMAGE_MAX_EDGE, Math.max(naturalWidth, naturalHeight)),
        1120,
        CANVAS_AI_INPUT_IMAGE_MIN_EDGE,
      ])).filter(edge => edge > 0);
      const qualities = Array.from(new Set([
        CANVAS_AI_INPUT_IMAGE_QUALITY,
        0.76,
        CANVAS_AI_INPUT_IMAGE_MIN_QUALITY,
      ]));

      for (const maxEdge of maxEdges) {
        const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        canvas.width = width;
        canvas.height = height;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, width, height);

        for (const quality of qualities) {
          const candidate = canvas.toDataURL('image/jpeg', quality);
          if (!candidate) continue;
          candidates.push(candidate);
          if (getDataUrlByteSize(candidate) <= CANVAS_AI_INPUT_IMAGE_TARGET_BYTES) {
            canvas.width = 0;
            canvas.height = 0;
            resolve(candidate);
            return;
          }
        }
      }

      canvas.width = 0;
      canvas.height = 0;
      const smallestCandidate = candidates.reduce((best, candidate) => (
        getDataUrlByteSize(candidate) < getDataUrlByteSize(best) ? candidate : best
      ), candidates[0] || dataUrl);
      resolve(getDataUrlByteSize(smallestCandidate) < originalBytes ? smallestCandidate : dataUrl);
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });

  const imageSourceToDataUrl = async (source: string, optimizeForAi = false) => {
    if (!source) return '';
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(source)) {
      return optimizeForAi ? optimizeCanvasAiInputDataUrl(source) : source;
    }
    const response = await fetch(source);
    if (!response.ok) throw new Error('读取参考图失败');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('参考图不是可用图片');
    const dataUrl = await blobToDataUrl(blob);
    return optimizeForAi ? optimizeCanvasAiInputDataUrl(dataUrl) : dataUrl;
  };

  const getCanvasAiInputSourceCandidates = (item: BufferItem) => {
    const path = String(item.path || '').trim();
    if (item.type === 'video') {
      const seen = new Set<string>();
      const remoteCandidates = [
        item.sourceUrl,
        item.originalUrl,
        item.url,
        path,
      ].filter(source => isRemoteHttpImageSource(source));
      return [
        ...remoteCandidates,
        path,
        item.url,
        item.sourceUrl,
        item.originalUrl,
      ]
        .map(value => String(value || '').trim())
        .filter((value) => {
          if (!value || seen.has(value)) return false;
          seen.add(value);
          return true;
        });
    }
    const pathPreviewSource = path
      && !/^(data:(?:image|video)\/|https?:\/\/|asset:|file:\/\/)/i.test(path)
      ? convertFileSrc(path)
      : '';
    const seen = new Set<string>();
    return [
      getCanvasItemDisplaySource(item),
      item.url,
      pathPreviewSource,
      item.path,
      item.sourceUrl,
      item.originalUrl,
      item.thumbnail,
    ]
      .map(value => String(value || '').trim())
      .filter((value) => {
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  };

  const isDirectCanvasAiInputSource = (source?: string | null) => {
    const value = String(source || '').trim();
    return isDataMediaSourceValue(value)
      || /^asset:/i.test(value)
      || /^file:\/\//i.test(value)
      || /^https?:\/\/(?:asset\.localhost|localhost|127\.0\.0\.1)/i.test(value)
      || /^[a-zA-Z]:[\\/]/.test(value)
      || /^\\\\/.test(value);
  };

  const prepareCanvasAiInputSource = async (item: BufferItem, mode: 'stable' | 'remote-first' = 'stable') => {
    const candidates = getCanvasAiInputSourceCandidates(item);
    const remoteFallback = candidates.find(source => isRemoteHttpImageSource(source));
    if (mode === 'remote-first' && remoteFallback) {
      return { source: remoteFallback, remoteFallback, usedRemoteFirst: true };
    }
    const localCandidates = candidates.filter(source => !isRemoteHttpImageSource(source));
    if (item.type === 'video') {
      const directVideoSource = localCandidates.find(source => isDirectCanvasAiInputSource(source));
      if (directVideoSource) return { source: directVideoSource, remoteFallback, usedRemoteFirst: false };
      if (remoteFallback) return { source: remoteFallback, remoteFallback, usedRemoteFirst: false };
      throw new Error('参考视频没有可用视频源');
    }
    let lastError: unknown = null;

    for (const source of localCandidates) {
      try {
        const dataUrl = await imageSourceToDataUrl(source, true);
        if (dataUrl) return { source: dataUrl, remoteFallback, usedRemoteFirst: false };
      } catch (err) {
        lastError = err;
      }
    }

    const directSource = localCandidates.find(source => isDirectCanvasAiInputSource(source));
    if (directSource) return { source: directSource, remoteFallback, warning: lastError, usedRemoteFirst: false };
    if (remoteFallback) return { source: remoteFallback, remoteFallback, usedRemoteFirst: false };
    throw lastError || new Error('参考图没有可用图片源');
  };

  const getCanvasAiOutputSize = (aspectRatio = CANVAS_AI_DEFAULT_ASPECT_RATIO) => {
    const [rawW, rawH] = aspectRatio.split(':').map(value => Number(value));
    const ratio = rawW > 0 && rawH > 0 ? rawW / rawH : 16 / 9;
    if (ratio >= 1) {
      const width = 320;
      return { width, height: Math.round(width / ratio) };
    }
    const height = 300;
    return { width: Math.round(height * ratio), height };
  };

  const cacheCanvasGeneratedImageSource = async (source: string, name: string) => {
    const trimmed = source.trim();
    if (!trimmed || (!/^data:(?:image|video)\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed))) {
      return { url: trimmed, path: '' };
    }

    const latestCacheDir = (
      webImageCacheDirRef.current ||
      localStorage.getItem('drawer_web_image_cache_dir') ||
      ''
    ).trim();

    try {
      const cachedPath = await invoke<string>('cache_web_image', {
        url: trimmed,
        name: name || AI_GENERATED_FOLDER_NAME,
        dir: latestCacheDir || undefined,
      });
      if (!cachedPath) return { url: trimmed, path: '' };
      return { url: convertFileSrc(cachedPath), path: cachedPath };
    } catch (err) {
      console.warn('AI 生成媒体预缓存失败，暂用接口返回源:', err);
      return { url: trimmed, path: '' };
    }
  };

  const createCanvasAiOutputDrafts = (target: CanvasImageItem, prompt: string): CanvasAiGeneratedOutput[] => {
    const count = clamp(Math.round(Number(target.ai?.count) || CANVAS_AI_DEFAULT_COUNT), 1, CANVAS_AI_MAX_OUTPUT_COUNT);
    const size = getCanvasAiOutputSize(target.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO);
    const now = Date.now();
    const mediaType = getCanvasAiMediaType(target.ai);
    return Array.from({ length: count }, (_, index) => ({
      id: `canvas_ai_output_${now.toString(36)}_${index}_${Math.random().toString(36).substring(2, 7)}`,
      mediaType,
      name: `AI generated ${mediaType} #${index + 1}`,
      prompt,
      status: 'working',
      generatedAt: now + index,
      width: size.width,
      height: size.height,
    }));
  };

  const getCanvasInputItemsForNode = (
    canvasItem: CanvasImageItem,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => {
    const itemsById = new Map(sourceItems.map(item => [item.id, item]));
    return (canvasItem.inputs || [])
      .map(inputId => itemsById.get(inputId))
      .filter((item): item is CanvasImageItem => !!item && item.id !== canvasItem.id);
  };

  const getCanvasTextInputsForNode = (
    canvasItem: CanvasImageItem,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => (
    getCanvasInputItemsForNode(canvasItem, sourceItems)
      .filter(item => item.item.type === 'text' && !item.ai)
      .map(item => item.item.content || '')
      .filter(Boolean)
  );

  const getCanvasImageInputBufferItemsForNode = (
    canvasItem: CanvasImageItem,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => {
    const mediaInputs: BufferItem[] = [];
    const isVideoGenerator = canvasItem.ai?.type === 'video-generator';
    const isFirstLastFrameMode = isVideoGenerator && canvasItem.ai?.videoInputMode === 'FLF';
    const maxImageInputs = isVideoGenerator ? (isFirstLastFrameMode ? 2 : 9) : 8;
    const maxVideoInputs = isVideoGenerator && !isFirstLastFrameMode ? 1 : 0;
    let imageInputCount = 0;
    let videoInputCount = 0;
    const pushInput = (item: BufferItem) => {
      if (item.type === 'image' && imageInputCount < maxImageInputs) {
        mediaInputs.push(item);
        imageInputCount += 1;
      } else if (item.type === 'video' && videoInputCount < maxVideoInputs) {
        mediaInputs.push(item);
        videoInputCount += 1;
      }
    };
    for (const inputItem of getCanvasInputItemsForNode(canvasItem, sourceItems)) {
      if (inputItem.item.type === 'image' || inputItem.item.type === 'video') {
        pushInput(inputItem.item);
      } else if (inputItem.ai?.type === 'image-generator' || inputItem.ai?.type === 'workflow') {
        getCanvasAiSuccessfulOutputs(inputItem).forEach((output, index) => {
          const outputItem = createCanvasAiOutputBufferItem(inputItem, output, index);
          if (outputItem) pushInput(outputItem);
        });
      } else if (inputItem.ai?.type === 'video-generator') {
        getCanvasAiSuccessfulOutputs(inputItem).forEach((output, index) => {
          const outputItem = createCanvasAiOutputBufferItem(inputItem, output, index);
          if (outputItem) pushInput(outputItem);
        });
      }
      if (imageInputCount >= maxImageInputs && videoInputCount >= maxVideoInputs) break;
    }
    return mediaInputs;
  };

  const stopTemporaryCloudflaredShares = async (shareIds: string[]) => {
    await Promise.all(shareIds.map(shareId => (
      invoke('stop_cloudflared_share', { shareId }).catch(err => {
        console.warn('cloudflared 临时分享清理失败:', err);
      })
    )));
  };

  const publishLocalAiInputs = async (sources: string[]) => {
    if (sources.length === 0) return { urls: [] as string[], shareIds: [] as string[] };
    if (!isCloudflaredDisclaimerAccepted) {
      throw new Error('使用本地图生图前，需要先同意本软件免责声明');
    }

    const cacheDir = await getLatestFileCacheDir();
    const result = await invoke<CloudflaredPublicImageUrlsResult>('create_cloudflared_public_image_urls', {
      sources,
      dir: cacheDir,
    });
    const urls = Array.isArray(result.urls) ? result.urls.filter(Boolean) : [];
    if (!result.shareId || urls.length === 0) {
      throw new Error('cloudflared 没有返回可用的公网图片 URL');
    }
    return { urls, shareIds: [result.shareId] };
  };

  const getCanvasImageInputsForNode = async (
    canvasItem: CanvasImageItem,
    mode: 'stable' | 'remote-first' = 'stable',
    delivery: 'auto' | 'direct' | 'remote-only' = 'auto',
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => {
    const provider = normalizeCanvasAiProvider(canvasItem.ai?.provider || canvasAiProvider);
    const inputMode = provider === 'openai-compatible' ? 'stable' : mode;
    const useDirectLocalInputs = provider === 'openai-compatible' || delivery === 'direct';
    const requireRemoteInputs = delivery === 'remote-only';
    const inputImageItems = getCanvasImageInputBufferItemsForNode(canvasItem, sourceItems);
    const result: string[] = [];
    let usedRemoteFirst = false;
    const localInputsForCloudflared: Array<{
      source: string;
      remoteFallback?: string;
      label: string;
      type: BufferItem['type'];
    }> = [];
    const temporaryShareIds: string[] = [];
    const failedItems: string[] = [];
    const failedVideoItems: string[] = [];
    for (const inputItem of inputImageItems) {
      const label = inputItem.name || inputItem.content || (inputItem.type === 'video' ? '参考视频' : '参考图');
      try {
        const prepared = await prepareCanvasAiInputSource(inputItem, inputMode);
        if (prepared.usedRemoteFirst) usedRemoteFirst = true;
        if (prepared.warning) {
          console.warn('AI 节点参考图浏览器读取失败，改用本地源:', prepared.warning);
        }
        if (isRemoteHttpImageSource(prepared.source)) {
          result.push(prepared.source);
          continue;
        }
        if (requireRemoteInputs && prepared.remoteFallback) {
          result.push(prepared.remoteFallback);
          continue;
        }
        localInputsForCloudflared.push({
          source: prepared.source,
          remoteFallback: prepared.remoteFallback,
          label,
          type: inputItem.type,
        });
      } catch (err) {
        console.warn('AI 节点参考图读取失败:', err);
        failedItems.push(label);
        if (inputItem.type === 'video') failedVideoItems.push(label);
      }
    }

    if (localInputsForCloudflared.length > 0) {
      const localSources = localInputsForCloudflared.map(item => item.source);
      if (provider === 'openai-compatible') {
        result.push(...localSources);
      } else if (requireRemoteInputs) {
        try {
          const published = await publishLocalAiInputs(localSources);
          result.push(...published.urls);
          temporaryShareIds.push(...published.shareIds);
        } catch (err) {
          const remoteFallbacks = localInputsForCloudflared
            .map(item => item.remoteFallback)
            .filter((value): value is string => !!value);
          const failedLocalVideos = localInputsForCloudflared
            .filter(item => item.type === 'video' && !item.remoteFallback)
            .map(item => item.label);
          if (remoteFallbacks.length > 0) {
            console.warn('公网参考图发布失败，img2 改用原始公网 URL 兜底:', err);
            result.push(...remoteFallbacks);
            failedVideoItems.push(...failedLocalVideos);
          } else {
            console.warn('公网参考图发布失败，img2 不使用 base64 兜底，避免请求体过大:', err);
            failedItems.push(...localInputsForCloudflared.map(item => item.label));
            failedVideoItems.push(...localInputsForCloudflared.filter(item => item.type === 'video').map(item => item.label));
          }
        }
      } else if (useDirectLocalInputs) {
        localInputsForCloudflared.forEach(item => {
          if (isDataMediaSourceValue(item.source)) {
            result.push(item.source);
          } else if (item.remoteFallback) {
            console.warn('本地参考图未能转成 data URL，改用原始公网 URL 兜底');
            result.push(item.remoteFallback);
          } else {
            failedItems.push(item.label);
            if (item.type === 'video') failedVideoItems.push(item.label);
          }
        });
      } else {
        try {
          const published = await publishLocalAiInputs(localSources);
          result.push(...published.urls);
          temporaryShareIds.push(...published.shareIds);
        } catch (err) {
          const remoteFallbacks = localInputsForCloudflared
            .map(item => item.remoteFallback)
            .filter((value): value is string => !!value);
          const dataUrlFallbacks = localSources.filter(source => isDataMediaSourceValue(source));

          if (provider === 'aoduo-ai') {
            if (remoteFallbacks.length > 0) {
              console.warn('cloudflared 参考图发布失败，改用原始公网 URL 兜底:', err);
              result.push(...remoteFallbacks);
            } else {
              console.warn('cloudflared 参考图发布失败，且中转2没有可用公网 URL:', err);
              failedItems.push(...localInputsForCloudflared.map(item => item.label));
              failedVideoItems.push(...localInputsForCloudflared.filter(item => item.type === 'video').map(item => item.label));
            }
          } else if (dataUrlFallbacks.length > 0 || remoteFallbacks.length > 0) {
            console.warn('cloudflared 参考图发布失败，改用可用兜底源:', err);
            result.push(...dataUrlFallbacks, ...remoteFallbacks);
          } else {
            console.warn('cloudflared 参考图发布失败，且没有可用兜底源:', err);
            failedItems.push(...localInputsForCloudflared.map(item => item.label));
            failedVideoItems.push(...localInputsForCloudflared.filter(item => item.type === 'video').map(item => item.label));
          }
        }
      }
    }

    if (canvasItem.ai?.type === 'video-generator' && failedVideoItems.length > 0) {
      throw new Error(`参考视频准备失败：${Array.from(new Set(failedVideoItems)).slice(0, 2).join('、')}`);
    }

    if (inputImageItems.length > 0 && result.length === 0) {
      const hint = delivery === 'remote-only'
        ? 'img2 模型需要公网参考图 URL，请确认 cloudflared 可用或使用公网图片'
        : delivery === 'direct'
          ? '请确认参考图可被读取为 jpg/png'
          : '请确认 cloudflared 可用';
      throw new Error(`参考图准备失败：${failedItems.slice(0, 3).join('、') || hint}`);
    }
    return { images: Array.from(new Set(result)), temporaryShareIds, usedRemoteFirst };
  };

  const getSelectedCanvasAiInputIds = () => (
    canvasSelectedIdsRef.current.filter(id => {
      const item = canvasItemsRef.current.find(canvasItem => canvasItem.id === id);
      return canUseCanvasItemAsAiInput(item);
    })
  );

  const applyCanvasPresetDraft = (preset?: CanvasAiPromptPreset | null) => {
    setCanvasPresetNameDraft(preset?.label || '');
    setCanvasPresetPromptDraft(preset?.prompt || '');
  };

  const updateCanvasNodesForPreset = (preset: CanvasAiPromptPreset) => {
    updateCanvasItemsImmediate(prev => prev.map(item => (
      item.ai?.type === 'image-generator' && item.ai.presetId === preset.id
        ? {
          ...item,
          item: {
            ...item.item,
            name: `AI ${preset.label}`,
          },
          ai: {
            ...item.ai,
            presetLabel: preset.label,
            presetPrompt: preset.prompt,
            aspectRatio: preset.aspectRatio || item.ai.aspectRatio,
            outputFormat: preset.outputFormat || item.ai.outputFormat,
            count: preset.count || item.ai.count,
            status: 'idle' as const,
            error: undefined,
          },
        }
        : item
    )));
  };

  const openCanvasPresetEditor = () => {
    setIsCanvasWorkflowManagerOpen(false);
    setCanvasPresetEditorMode('create');
    setCanvasPresetEditingId('');
    setCanvasPresetNameDraft('');
    setCanvasPresetPromptDraft('');
    setIsCanvasPresetEditorOpen(true);
  };

  const openCanvasPresetManager = (presetId?: string) => {
    setIsCanvasWorkflowManagerOpen(false);
    const preset = canvasAiPromptPresets.find(item => item.id === presetId)
      || canvasAiPromptPresets[0]
      || null;
    if (!preset) {
      openCanvasPresetEditor();
      return;
    }
    setCanvasPresetEditorMode('manage');
    setCanvasPresetEditingId(preset.id);
    applyCanvasPresetDraft(preset);
    setIsCanvasPresetEditorOpen(true);
  };

  const selectCanvasPresetForEdit = (presetId: string) => {
    const preset = canvasAiPromptPresets.find(item => item.id === presetId);
    if (!preset) return;
    setCanvasPresetEditingId(preset.id);
    applyCanvasPresetDraft(preset);
  };

  const closeCanvasPresetEditor = () => {
    setIsCanvasPresetEditorOpen(false);
    setCanvasPresetEditorMode('create');
    setCanvasPresetEditingId('');
    setCanvasPresetNameDraft('');
    setCanvasPresetPromptDraft('');
  };

  const saveCanvasAiCustomPromptPreset = () => {
    const label = canvasPresetNameDraft.trim().slice(0, 24);
    const prompt = canvasPresetPromptDraft.trim();
    if (!label || !prompt) {
      showToast('请填写预设名称和 Prompt');
      return;
    }
    const editingPreset = canvasPresetEditorMode === 'manage'
      ? canvasAiPromptPresets.find(item => item.id === canvasPresetEditingId)
      : null;
    const preset: CanvasAiPromptPreset = {
      id: editingPreset?.id || `custom-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      label,
      hint: editingPreset?.hint || '自定义 Prompt 预设',
      prompt,
      aspectRatio: editingPreset?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
      outputFormat: editingPreset?.outputFormat || CANVAS_AI_DEFAULT_OUTPUT_FORMAT,
      count: editingPreset?.count,
    };
    setCustomCanvasAiPromptPresets(prev => (
      prev.some(item => item.id === preset.id)
        ? prev.map(item => item.id === preset.id ? preset : item)
        : [...prev, preset]
    ));
    updateCanvasNodesForPreset(preset);
    closeCanvasPresetEditor();
    showToast(canvasPresetEditorMode === 'manage' ? `已更新预设「${label}」` : `已新增预设「${label}」`);
  };

  const deleteCanvasAiCustomPromptPreset = () => {
    if (!canvasPresetEditingId) return;
    const editingId = canvasPresetEditingId;
    const customPreset = customCanvasAiPromptPresets.find(item => item.id === editingId);
    const builtInPreset = CANVAS_AI_PROMPT_PRESETS.find(item => item.id === editingId);
    if (!customPreset) {
      showToast('内置预设尚未修改，无需恢复');
      return;
    }
    setCustomCanvasAiPromptPresets(prev => prev.filter(item => item.id !== editingId));
    if (builtInPreset) {
      updateCanvasNodesForPreset(builtInPreset);
      applyCanvasPresetDraft(builtInPreset);
      showToast(`已恢复「${builtInPreset.label}」默认预设`);
      return;
    }
    closeCanvasPresetEditor();
    showToast(`已删除预设「${customPreset.label}」`);
  };

  const getCanvasTemplateImportPayload = (rawValue: unknown) => {
    const record = rawValue && typeof rawValue === 'object' ? rawValue as Record<string, unknown> : {};
    const rawPresets = Array.isArray(record.presets)
      ? record.presets
      : (record.prompt && record.label ? [record] : []);
    const rawWorkflows = Array.isArray(record.workflows)
      ? record.workflows
      : (Array.isArray(record.nodes) && record.label ? [record] : []);
    return {
      presets: rawPresets
        .map(normalizeCanvasAiPromptPreset)
        .filter((item): item is CanvasAiPromptPreset => !!item),
      workflows: rawWorkflows
        .map(normalizeCanvasWorkflowTemplate)
        .filter((item): item is CanvasWorkflowTemplate => !!item)
        .map(workflow => ({ ...workflow, builtin: false })),
    };
  };

  const chooseCanvasTemplateImportFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    return Array.isArray(selected) ? selected[0] : selected;
  };

  const importCanvasTemplateFile = async (scope: 'preset' | 'workflow' | 'all') => {
    try {
      const filePath = await chooseCanvasTemplateImportFile();
      if (!filePath) return;
      const parsed = JSON.parse(await readTextFile(filePath));
      const payload = getCanvasTemplateImportPayload(parsed);
      const shouldImportPresets = scope === 'preset' || scope === 'all';
      const shouldImportWorkflows = scope === 'workflow' || scope === 'all';
      let importedPresetCount = 0;
      let importedWorkflowCount = 0;

      if (shouldImportPresets && payload.presets.length > 0) {
        importedPresetCount = payload.presets.length;
        setCustomCanvasAiPromptPresets(prev => {
          const map = new Map(prev.map(item => [item.id, item]));
          payload.presets.forEach(preset => {
            map.set(preset.id, preset);
          });
          return Array.from(map.values()).slice(0, 48);
        });
        payload.presets.forEach(updateCanvasNodesForPreset);
        const firstPreset = payload.presets[0];
        if (scope === 'preset' && firstPreset) {
          setCanvasPresetEditorMode('manage');
          setCanvasPresetEditingId(firstPreset.id);
          applyCanvasPresetDraft(firstPreset);
        }
      }

      if (shouldImportWorkflows && payload.workflows.length > 0) {
        const usedWorkflowIds = new Set(canvasWorkflowTemplates.map(workflow => workflow.id));
        const importedWorkflows = payload.workflows.map((workflow, index) => {
          let nextId = '';
          do {
            nextId = `imported-workflow-${Date.now().toString(36)}-${index}-${Math.random().toString(36).substring(2, 6)}`;
          } while (usedWorkflowIds.has(nextId));
          usedWorkflowIds.add(nextId);
          return {
            ...workflow,
            id: nextId,
            builtin: false,
            createdAt: Date.now() + index,
          };
        });
        importedWorkflowCount = importedWorkflows.length;
        setCustomCanvasWorkflows(prev => {
          return [...importedWorkflows, ...prev].slice(0, 48);
        });
        const firstWorkflow = importedWorkflows[0];
        if (scope === 'workflow' && firstWorkflow) {
          setCanvasWorkflowEditingId(firstWorkflow.id);
          setCanvasWorkflowNameDraft(firstWorkflow.label);
          setCanvasWorkflowHintDraft(firstWorkflow.hint || '');
          setIsCanvasPresetEditorOpen(false);
          setIsCanvasWorkflowManagerOpen(true);
        }
      }

      if (importedPresetCount === 0 && importedWorkflowCount === 0) {
        showToast('没有找到可导入的预设或工作流');
        return;
      }
      showToast(`已导入 ${importedPresetCount} 个预设、${importedWorkflowCount} 个工作流`);
    } catch (err) {
      console.warn('导入画布模板失败:', err);
      showToast('导入失败，请检查 JSON 文件');
    }
  };

  const exportCanvasTemplateFile = async (
    payload: { presets?: CanvasAiPromptPreset[]; workflows?: CanvasWorkflowTemplate[] },
    defaultName: string
  ) => {
    const presets = (payload.presets || []).map(preset => ({ ...preset }));
    const workflows = (payload.workflows || []).map(workflow => ({ ...workflow, builtin: false }));
    if (presets.length === 0 && workflows.length === 0) {
      showToast('没有可导出的内容');
      return;
    }
    try {
      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!filePath) return;
      await invoke('save_item_source_as', {
        source: '',
        dest: filePath,
        content: JSON.stringify({
        type: CANVAS_TEMPLATE_EXPORT_TYPE,
        version: CANVAS_TEMPLATE_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        presets,
        workflows,
        }, null, 2),
        itemType: 'text',
      });
      showToast('已导出 JSON 文件');
    } catch (err) {
      console.warn('导出画布模板失败:', err);
      showToast('导出失败');
    }
  };

  const exportCurrentCanvasPreset = () => {
    const preset = canvasAiPromptPresets.find(item => item.id === canvasPresetEditingId);
    if (!preset) {
      showToast('请选择要导出的预设');
      return;
    }
    void exportCanvasTemplateFile({ presets: [preset] }, `${preset.label || 'canvas-preset'}.json`);
  };

  const exportAllCustomCanvasPresets = () => {
    void exportCanvasTemplateFile({ presets: customCanvasAiPromptPresets }, 'canvas-prompt-presets.json');
  };

  const buildCanvasAiGeneratorNode = (
    pos: { x: number; y: number },
    preset?: CanvasAiPromptPreset,
    inputIds: string[] = [],
    mediaType: 'image' | 'video' = 'image'
  ): CanvasImageItem => {
    const itemId = Math.random().toString(36).substring(2, 9);
    const presetPrompt = getCanvasAiPresetPrompt(preset);
    const isVideo = mediaType === 'video';
    const name = preset ? `AI ${preset.label}` : (isVideo ? 'AI 视频节点' : 'AI 生图节点');
    const aspectRatio = preset?.aspectRatio || (isVideo ? '9:16' : CANVAS_AI_DEFAULT_ASPECT_RATIO);
    const count = preset?.count || CANVAS_AI_DEFAULT_COUNT;
    const nodeSize = getCanvasAiNodeAutoSize({
      type: isVideo ? 'video-generator' : 'image-generator',
      aspectRatio,
      count,
      hasPreset: !!preset,
    });
    const item: BufferItem = {
      id: itemId,
      type: 'text',
      content: '',
      name,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    return {
      id: `canvas_ai_${itemId}`,
      item,
      x: pos.x,
      y: pos.y,
      width: nodeSize.width,
      height: nodeSize.height,
      inputs: Array.from(new Set(inputIds)),
      ai: {
        type: isVideo ? 'video-generator' : 'image-generator',
        provider: isVideo ? 'xais-chat' : canvasAiProvider,
        model: getCanvasAiDefaultModel(isVideo ? 'xais-chat' : canvasAiProvider, mediaType),
        prompt: '',
        presetId: preset?.id,
        presetLabel: preset?.label,
        presetPrompt: presetPrompt || undefined,
        aspectRatio,
        resolution: isVideo ? CANVAS_AI_DEFAULT_VIDEO_RESOLUTION : undefined,
        outputFormat: preset?.outputFormat || CANVAS_AI_DEFAULT_OUTPUT_FORMAT,
        count,
        duration: isVideo ? CANVAS_AI_DEFAULT_VIDEO_DURATION : undefined,
        videoInputMode: isVideo ? 'REF' : undefined,
        status: 'idle',
      },
    };
  };

  const addCanvasAiGeneratorNode = (client?: { x: number; y: number }, preset?: CanvasAiPromptPreset) => {
    const inputIds = preset ? getSelectedCanvasAiInputIds() : [];
    const inputBounds = inputIds.length > 0 ? getCanvasItemsBounds(inputIds) : null;
    const pos = inputBounds && !client
      ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
      : getCanvasDropPosition(0, client);
    const canvasItem = buildCanvasAiGeneratorNode(pos, preset, inputIds);
    if (appendCanvasItems([canvasItem], preset ? `新增 ${preset.label} Prompt 节点` : '新增 AI 生图节点') > 0) {
      showToast(preset
        ? `已添加「${preset.label}」Prompt 节点${inputIds.length > 0 ? `，已连接 ${inputIds.length} 个输入` : ''}`
        : '已添加 AI 生图节点');
    }
  };

  const addCanvasAiGeneratorNodeAtWorld = (world: { x: number; y: number }, preset?: CanvasAiPromptPreset) => {
    const inputIds = preset ? getSelectedCanvasAiInputIds() : [];
    const canvasItem = buildCanvasAiGeneratorNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, preset, inputIds);
    if (appendCanvasItems([canvasItem], preset ? `新增 ${preset.label} Prompt 节点` : '新增 AI 生图节点') > 0) {
      showToast(preset
        ? `已添加「${preset.label}」Prompt 节点${inputIds.length > 0 ? `，已连接 ${inputIds.length} 个输入` : ''}`
        : '已添加 AI 生图节点');
    }
  };

  const addCanvasAiVideoGeneratorNode = (client?: { x: number; y: number }) => {
    const inputIds = getSelectedCanvasAiInputIds();
    const inputBounds = inputIds.length > 0 ? getCanvasItemsBounds(inputIds) : null;
    const pos = inputBounds && !client
      ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
      : getCanvasDropPosition(0, client);
    const canvasItem = buildCanvasAiGeneratorNode(pos, undefined, inputIds, 'video');
    if (appendCanvasItems([canvasItem], '新增 AI 视频节点') > 0) {
      showToast(`已添加 AI 视频节点${inputIds.length > 0 ? `，已连接 ${inputIds.length} 个输入` : ''}`);
    }
  };

  const addCanvasAiVideoGeneratorNodeAtWorld = (world: { x: number; y: number }) => {
    const inputIds = getSelectedCanvasAiInputIds();
    const canvasItem = buildCanvasAiGeneratorNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, undefined, inputIds, 'video');
    if (appendCanvasItems([canvasItem], '新增 AI 视频节点') > 0) {
      showToast(`已添加 AI 视频节点${inputIds.length > 0 ? `，已连接 ${inputIds.length} 个输入` : ''}`);
    }
  };

  const getCanvasWorkflowTemplateFromNode = (canvasItem?: CanvasImageItem | null) => {
    if (canvasItem?.ai?.type !== 'workflow') return null;
    const snapshot = normalizeCanvasWorkflowTemplate(canvasItem.ai.workflow);
    const builtInWorkflow = canvasItem.ai.presetId
      ? CANVAS_BUILT_IN_WORKFLOWS.find(workflow => workflow.id === canvasItem.ai?.presetId)
      : null;
    return snapshot?.builtin && builtInWorkflow ? builtInWorkflow : snapshot;
  };

  const getCanvasWorkflowGeneratorNodes = (workflow: CanvasWorkflowTemplate) => (
    workflow.nodes.filter(node => node.ai?.type === 'image-generator')
  );

  const getCanvasWorkflowTerminalNodeTemplates = (workflow: CanvasWorkflowTemplate) => {
    const generatorIds = new Set(getCanvasWorkflowGeneratorNodes(workflow).map(node => node.id));
    const upstreamGeneratorIds = new Set<string>();
    workflow.nodes.forEach(node => {
      if (node.ai?.type !== 'image-generator') return;
      (node.inputs || []).forEach(inputId => {
        if (generatorIds.has(inputId)) upstreamGeneratorIds.add(inputId);
      });
    });
    const terminalNodes = getCanvasWorkflowGeneratorNodes(workflow).filter(node => !upstreamGeneratorIds.has(node.id));
    return terminalNodes.length > 0 ? terminalNodes : getCanvasWorkflowGeneratorNodes(workflow).slice(-1);
  };

  const getCanvasWorkflowOutputLabel = (node: CanvasWorkflowNodeTemplate, index?: number) => {
    const label = node.ai?.presetLabel || node.item.name || '工作流输出';
    return index && index > 0 ? `${label} #${index + 1}` : label;
  };

  const getCanvasWorkflowOutputSlotTemplates = (
    workflow: CanvasWorkflowTemplate,
    mode: 'final' | 'all' = 'final'
  ) => {
    const outputNodes = mode === 'all'
      ? getCanvasWorkflowGeneratorNodes(workflow)
      : getCanvasWorkflowTerminalNodeTemplates(workflow);
    const slots = outputNodes.flatMap(node => {
      const count = clamp(Math.round(Number(node.ai?.count) || CANVAS_AI_DEFAULT_COUNT), 1, CANVAS_WORKFLOW_MAX_OUTPUT_SLOTS);
      return Array.from({ length: count }, (_, index) => ({ node, index }));
    });
    const fallbackNode = outputNodes[outputNodes.length - 1] || workflow.nodes.find(node => node.ai?.type === 'image-generator') || workflow.nodes[0];
    if (slots.length > 0) return slots.slice(0, CANVAS_WORKFLOW_MAX_OUTPUT_SLOTS);
    return fallbackNode ? [{ node: fallbackNode, index: 0 }] : [];
  };

  const createCanvasWorkflowOutputDrafts = (
    canvasItem: CanvasImageItem,
    workflow: CanvasWorkflowTemplate,
    status?: CanvasAiGeneratedOutput['status'],
    mode: 'final' | 'all' = 'final'
  ): CanvasAiGeneratedOutput[] => {
    const now = Date.now();
    const slots = getCanvasWorkflowOutputSlotTemplates(workflow, mode);
    return (slots.length > 0 ? slots : [{ node: workflow.nodes[0], index: 0 }]).map((slot, slotIndex) => {
      const size = getCanvasAiOutputSize(slot.node.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO);
      const label = getCanvasWorkflowOutputLabel(slot.node, slot.index);
      return {
        id: `${canvasItem.id}_workflow_${mode}_output_${slot.node.id}_${slot.index}`,
        name: label || `输出 ${slotIndex + 1}`,
        nodeId: slot.node.id,
        nodeLabel: getCanvasWorkflowOutputLabel(slot.node),
        prompt: slot.node.ai?.presetPrompt || slot.node.item.content || '',
        status,
        generatedAt: status ? now + slotIndex : undefined,
        width: size.width,
        height: size.height,
      };
    });
  };

  const normalizeCanvasWorkflowRuntimeSnapshots = (value: unknown): CanvasWorkflowRuntimeNodeSnapshot[] => {
    if (!Array.isArray(value)) return [];
    return value.map(item => {
      const record = item && typeof item === 'object'
        ? item as Partial<CanvasWorkflowRuntimeNodeSnapshot>
        : {};
      const templateId = typeof record.templateId === 'string' ? record.templateId : '';
      if (!templateId) return null;
      return {
        templateId,
        item: record.item && typeof record.item === 'object' ? cloneDrawerValue(record.item) : undefined,
        ai: record.ai && typeof record.ai === 'object' ? cloneDrawerValue(record.ai) : undefined,
      } as CanvasWorkflowRuntimeNodeSnapshot;
    }).filter((item): item is CanvasWorkflowRuntimeNodeSnapshot => !!item);
  };

  const createCanvasWorkflowRuntimeSnapshots = (
    workflow: CanvasWorkflowTemplate,
    runtimeItems: CanvasImageItem[],
    idMap: Map<string, string>
  ): CanvasWorkflowRuntimeNodeSnapshot[] => (
    workflow.nodes.map(node => {
      const runtimeId = idMap.get(node.id);
      const runtimeItem = runtimeItems.find(item => item.id === runtimeId);
      if (!runtimeItem) return null;
      return {
        templateId: node.id,
        item: {
          content: runtimeItem.item.content,
          name: runtimeItem.item.name,
          remark: runtimeItem.item.remark,
          remarks: runtimeItem.item.remarks,
        },
        ai: runtimeItem.ai
          ? {
            prompt: runtimeItem.ai.prompt,
            status: runtimeItem.ai.status,
            error: runtimeItem.ai.error,
            generatedAt: runtimeItem.ai.generatedAt,
            outputs: cloneDrawerValue(runtimeItem.ai.outputs || []),
          }
          : undefined,
      } as CanvasWorkflowRuntimeNodeSnapshot;
    }).filter((item): item is CanvasWorkflowRuntimeNodeSnapshot => !!item)
  );

  const getCanvasWorkflowGroup = (canvasItem?: CanvasImageItem | null): CanvasWorkflowExpandedGroup | null => {
    const group = canvasItem?.workflowGroup;
    if (!group || typeof group !== 'object') return null;
    const record = group as Partial<CanvasWorkflowExpandedGroup>;
    if (!record.groupId || !record.templateId || !record.workflowId || !record.module) return null;
    return record as CanvasWorkflowExpandedGroup;
  };

  const getCanvasWorkflowExpandedGroupItems = (groupId: string) => (
    canvasItemsRef.current.filter(item => getCanvasWorkflowGroup(item)?.groupId === groupId)
  );

  const applyCanvasWorkflowRuntimeSnapshots = (
    workflow: CanvasWorkflowTemplate,
    items: CanvasImageItem[],
    idMap: Map<string, string>,
    runtimeSnapshots: CanvasWorkflowRuntimeNodeSnapshot[]
  ) => {
    if (runtimeSnapshots.length === 0) return items;
    const snapshotByTemplateId = new Map(runtimeSnapshots.map(snapshot => [snapshot.templateId, snapshot]));
    return items.map(item => {
      const templateEntry = Array.from(idMap.entries()).find(([, runtimeId]) => runtimeId === item.id);
      const templateId = templateEntry?.[0];
      if (!templateId) return item;
      const snapshot = snapshotByTemplateId.get(templateId);
      if (!snapshot) return item;
      const templateNode = workflow.nodes.find(node => node.id === templateId);
      return {
        ...item,
        item: {
          ...item.item,
          content: snapshot.item?.content ?? item.item.content,
          name: snapshot.item?.name ?? item.item.name,
          remark: snapshot.item?.remark ?? item.item.remark,
          remarks: snapshot.item?.remarks ?? item.item.remarks,
        },
        ai: item.ai && snapshot.ai
          ? {
            ...item.ai,
            prompt: snapshot.ai.prompt ?? item.ai.prompt,
            status: snapshot.ai.status || item.ai.status,
            error: snapshot.ai.error,
            generatedAt: snapshot.ai.generatedAt,
            outputs: cloneDrawerValue(snapshot.ai.outputs || []),
            aspectRatio: templateNode?.ai?.aspectRatio || item.ai.aspectRatio,
            outputFormat: templateNode?.ai?.outputFormat || item.ai.outputFormat,
            count: templateNode?.ai?.count || item.ai.count,
          }
          : item.ai,
      };
    });
  };

  const instantiateCanvasWorkflowTemplateItems = (
    workflow: CanvasWorkflowTemplate,
    base: { x: number; y: number },
    externalInputIds: string[] = []
  ) => {
    const cleanWorkflow = normalizeCanvasWorkflowTemplate(workflow);
    if (!cleanWorkflow) {
      return { workflow: null, items: [] as CanvasImageItem[], idMap: new Map<string, string>() };
    }
    const templateBounds = {
      x: Math.min(...cleanWorkflow.nodes.map(node => node.x)),
      y: Math.min(...cleanWorkflow.nodes.map(node => node.y)),
    };
    const templateAiNodeIds = new Set(cleanWorkflow.nodes
      .filter(node => node.ai?.type === 'image-generator')
      .map(node => node.id));
    const idMap = new Map<string, string>();

    cleanWorkflow.nodes.forEach(node => {
      const nextBufferId = Math.random().toString(36).substring(2, 9);
      idMap.set(node.id, node.ai?.type === 'image-generator' ? `canvas_ai_${nextBufferId}` : `canvas_${nextBufferId}`);
    });

    const now = Date.now();
    const nextItems = cleanWorkflow.nodes.map((node, index) => {
      const nextBufferId = Math.random().toString(36).substring(2, 9);
      const nextCanvasId = idMap.get(node.id) || (node.ai?.type === 'image-generator' ? `canvas_ai_${nextBufferId}` : `canvas_${nextBufferId}`);
      const isAiGenerator = node.ai?.type === 'image-generator';
      const provider = normalizeCanvasAiProvider(node.ai?.provider || canvasAiProvider);
      const internalInputs = (node.inputs || [])
        .map(inputId => idMap.get(inputId))
        .filter((inputId): inputId is string => !!inputId);
      const isRootAiNode = isAiGenerator && !(node.inputs || []).some(inputId => templateAiNodeIds.has(inputId));
      const item: BufferItem = {
        ...cloneDrawerValue(node.item),
        id: nextBufferId,
        type: node.item.type || 'text',
        content: node.item.content || '',
        name: node.item.name || (isAiGenerator ? `AI ${node.ai?.presetLabel || '生图节点'}` : '工作流卡片'),
        createdAt: now + index,
        isQuickAccess: false,
      };
      return {
        id: nextCanvasId,
        item,
        x: Math.max(24, base.x + node.x - templateBounds.x),
        y: Math.max(24, base.y + node.y - templateBounds.y),
        width: node.width,
        height: node.height,
        inputs: Array.from(new Set([
          ...internalInputs,
          ...(isRootAiNode ? externalInputIds : []),
        ])),
        ai: isAiGenerator
          ? {
            ...cloneDrawerValue(node.ai || {}),
            type: 'image-generator' as const,
            provider,
            model: node.ai?.model || getCanvasAiDefaultModel(provider),
            status: 'idle' as const,
            error: undefined,
            generatedAt: undefined,
            outputs: [],
          }
          : undefined,
      } as CanvasImageItem;
    });

    return { workflow: cleanWorkflow, items: nextItems, idMap };
  };

  const buildCanvasWorkflowModuleNode = (
    workflow: CanvasWorkflowTemplate,
    pos: { x: number; y: number },
    inputIds: string[] = []
  ): CanvasImageItem | null => {
    const cleanWorkflow = normalizeCanvasWorkflowTemplate(workflow);
    if (!cleanWorkflow) return null;
    const itemId = Math.random().toString(36).substring(2, 9);
    const outputSlots = getCanvasWorkflowOutputSlotTemplates(cleanWorkflow);
    const outputSlotCount = Math.max(1, outputSlots.length);
    const firstOutputAspectRatio = outputSlots[0]?.node.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO;
    const nodeSize = getCanvasAiNodeAutoSize({
      type: 'workflow',
      aspectRatio: firstOutputAspectRatio,
      outputCount: outputSlotCount,
    });
    return {
      id: `canvas_workflow_${itemId}`,
      item: {
        id: itemId,
        type: 'text',
        content: '',
        name: `工作流 ${cleanWorkflow.label}`,
        remark: cleanWorkflow.hint,
        createdAt: Date.now(),
        isQuickAccess: false,
      },
      x: Math.max(24, pos.x),
      y: Math.max(24, pos.y),
      width: nodeSize.width,
      height: nodeSize.height,
      inputs: Array.from(new Set(inputIds)),
      ai: {
        type: 'workflow',
        provider: canvasAiProvider,
        model: getCanvasAiDefaultModel(canvasAiProvider),
        presetId: cleanWorkflow.id,
        presetLabel: cleanWorkflow.label,
        presetPrompt: cleanWorkflow.hint,
        count: outputSlotCount,
        status: 'idle',
        outputs: [],
        workflow: cleanWorkflow,
      },
    };
  };

  const addCanvasWorkflowTemplate = (workflow: CanvasWorkflowTemplate, client?: { x: number; y: number }) => {
    const cleanWorkflow = normalizeCanvasWorkflowTemplate(workflow);
    if (!cleanWorkflow) {
      showToast('工作流模板不可用');
      return 0;
    }
    const selectedInputIds = getSelectedCanvasAiInputIds();
    const inputBounds = selectedInputIds.length > 0 ? getCanvasItemsBounds(selectedInputIds) : null;
    const targetPoint = client ? getCanvasPointFromClient(client.x, client.y) : null;
    const base = inputBounds && !targetPoint
      ? { x: inputBounds.x + inputBounds.width + 96, y: inputBounds.y }
      : (targetPoint || getCanvasDropPosition(0, client));
    const canvasItem = buildCanvasWorkflowModuleNode(cleanWorkflow, base, selectedInputIds);
    if (!canvasItem) {
      showToast('工作流模板不可用');
      return 0;
    }
    const addedCount = appendCanvasItems([canvasItem], `添加工作流「${cleanWorkflow.label}」`);
    if (addedCount > 0) {
      showToast(`已添加工作流模块「${cleanWorkflow.label}」${selectedInputIds.length > 0 ? `，已接入 ${selectedInputIds.length} 个输入` : ''}`);
    }
    return addedCount;
  };

  const buildCanvasWorkflowSaveDraftFromSelection = (defaultName: string): CanvasWorkflowSaveDraft | null => {
    const selectedIds = canvasSelectedIdsRef.current;
    if (selectedIds.length === 0) {
      showToast('先框选要保存为工作流的节点');
      return null;
    }
    const selectedIdSet = new Set(selectedIds);
    const selectedItems = canvasItemsRef.current.filter(item => selectedIdSet.has(item.id));
    const workflowItems = selectedItems.filter(item => item.ai?.type !== 'workflow' && (item.ai?.type === 'image-generator' || canUseCanvasItemAsAiInput(item)));
    const aiCount = workflowItems.filter(item => item.ai?.type === 'image-generator').length;
    if (aiCount === 0) {
      showToast('工作流至少需要包含一个生图节点');
      return null;
    }
    const bounds = getCanvasBoundsFromItems(workflowItems);
    if (!bounds) return null;
    const workflowNodeIds = new Set(workflowItems.map(item => item.id));
    const nodes = workflowItems.map((item): CanvasWorkflowNodeTemplate => {
      const savedItem = stripHeavyDataThumbnail(item.item);
      const safeUrl = savedItem.url && isDataImageSourceValue(savedItem.url) ? undefined : savedItem.url;
      const safeThumbnail = savedItem.thumbnail && isDataImageSourceValue(savedItem.thumbnail) ? undefined : savedItem.thumbnail;
      const safeSourceUrl = savedItem.sourceUrl && isDataImageSourceValue(savedItem.sourceUrl) ? undefined : savedItem.sourceUrl;
      const safeOriginalUrl = savedItem.originalUrl && isDataImageSourceValue(savedItem.originalUrl) ? undefined : savedItem.originalUrl;
      return {
        id: item.id,
        x: item.x - bounds.x,
        y: item.y - bounds.y,
        width: item.width,
        height: item.height,
        item: {
          ...savedItem,
          id: item.item.id,
          type: item.item.type,
          content: item.item.content || '',
          name: item.item.name,
          createdAt: 0,
          isQuickAccess: false,
          url: safeUrl,
          thumbnail: safeThumbnail,
          sourceUrl: safeSourceUrl,
          originalUrl: safeOriginalUrl,
        },
        inputs: (item.inputs || []).filter(inputId => workflowNodeIds.has(inputId)),
        ai: item.ai
          ? {
            ...cloneDrawerValue(item.ai),
            status: 'idle' as const,
            error: undefined,
            generatedAt: undefined,
            outputs: [],
          }
          : undefined,
      };
    });
    const externalInputIds = Array.from(new Set(workflowItems.flatMap(item => (
      (item.inputs || []).filter(inputId => !workflowNodeIds.has(inputId))
    ))));
    return {
      label: defaultName,
      defaultLabel: defaultName,
      nodes,
      bounds,
      externalInputIds,
      selectedItemIds: workflowItems.map(item => item.id),
      aiCount,
    };
  };

  const saveSelectedCanvasWorkflow = () => {
    const selectedIds = canvasSelectedIdsRef.current;
    const selectedIdSet = new Set(selectedIds);
    const selectedItems = canvasItemsRef.current.filter(item => selectedIdSet.has(item.id));
    const aiCount = selectedItems.filter(item => item.ai?.type === 'image-generator').length;
    const defaultName = aiCount > 1 ? `我的工作流 ${customCanvasWorkflows.length + 1}` : '我的生图工作流';
    const draft = buildCanvasWorkflowSaveDraftFromSelection(defaultName);
    if (draft) setCanvasWorkflowSaveDraft(draft);
  };

  const closeCanvasWorkflowSaveDialog = () => {
    setCanvasWorkflowSaveDraft(null);
  };

  const confirmSaveCanvasWorkflow = () => {
    if (!canvasWorkflowSaveDraft) return;
    const label = canvasWorkflowSaveDraft.label.trim().slice(0, 32);
    if (!label) {
      showToast('请输入工作流名称');
      return;
    }
    const workflow: CanvasWorkflowTemplate = {
      id: `custom-workflow-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      label,
      hint: `${canvasWorkflowSaveDraft.nodes.length} 个节点，${canvasWorkflowSaveDraft.aiCount} 个生图节点`,
      nodes: canvasWorkflowSaveDraft.nodes,
      createdAt: Date.now(),
    };
    const moduleNode = buildCanvasWorkflowModuleNode(
      workflow,
      { x: canvasWorkflowSaveDraft.bounds.x, y: canvasWorkflowSaveDraft.bounds.y },
      canvasWorkflowSaveDraft.externalInputIds
    );
    if (!moduleNode) {
      showToast('工作流封装失败');
      return;
    }
    setCustomCanvasWorkflows(prev => [workflow, ...prev].slice(0, 24));
    pushCanvasUndoSnapshot('封装工作流');
    updateCanvasItemsImmediate(prev => {
      const selectedSet = new Set(canvasWorkflowSaveDraft.selectedItemIds);
      const nextItems = prev
        .filter(item => !selectedSet.has(item.id))
        .map(item => {
          const inputs = item.inputs || [];
          if (!inputs.some(inputId => selectedSet.has(inputId))) return item;
          return {
            ...item,
            inputs: Array.from(new Set(inputs.map(inputId => selectedSet.has(inputId) ? moduleNode.id : inputId))),
          };
        });
      return [...nextItems, moduleNode];
    });
    updateCanvasSelection([moduleNode.id]);
    closeCanvasWorkflowSaveDialog();
    showToast(`已保存并封装工作流「${label}」`);
  };

  const updateCanvasWorkflowModuleNodesForTemplate = (
    workflow: CanvasWorkflowTemplate,
    resetOutputs = false
  ) => {
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.ai?.type !== 'workflow' || item.ai.presetId !== workflow.id) return item;
      return {
        ...item,
        item: {
          ...item.item,
          name: `工作流 ${workflow.label}`,
          remark: workflow.hint,
        },
        ai: {
          ...item.ai,
          presetLabel: workflow.label,
          presetPrompt: workflow.hint,
          workflow,
          outputs: resetOutputs ? [] : item.ai.outputs,
          workflowRuntime: resetOutputs ? undefined : item.ai.workflowRuntime,
          status: resetOutputs ? 'idle' as const : item.ai.status,
          error: resetOutputs ? undefined : item.ai.error,
          generatedAt: resetOutputs ? undefined : item.ai.generatedAt,
        },
      };
    }));
  };

  const selectCanvasWorkflowForEdit = (workflowId: string) => {
    const workflow = canvasWorkflowTemplates.find(item => item.id === workflowId) || canvasWorkflowTemplates[0];
    if (!workflow) return;
    setCanvasWorkflowEditingId(workflow.id);
    setCanvasWorkflowNameDraft(workflow.label);
    setCanvasWorkflowHintDraft(workflow.hint || '');
  };

  const openCanvasWorkflowManager = (workflowId?: string) => {
    const workflow = (workflowId ? canvasWorkflowTemplates.find(item => item.id === workflowId) : null)
      || canvasWorkflowTemplates.find(item => !item.builtin)
      || canvasWorkflowTemplates[0];
    if (!workflow) {
      showToast('暂无可管理的工作流');
      return;
    }
    setIsCanvasPresetEditorOpen(false);
    selectCanvasWorkflowForEdit(workflow.id);
    setIsCanvasWorkflowManagerOpen(true);
  };

  const closeCanvasWorkflowManager = () => {
    setIsCanvasWorkflowManagerOpen(false);
  };

  const saveCanvasWorkflowManagerChanges = () => {
    const source = canvasWorkflowTemplates.find(item => item.id === canvasWorkflowEditingId);
    if (!source) {
      showToast('请选择要修改的工作流');
      return;
    }
    const label = canvasWorkflowNameDraft.trim().slice(0, 32);
    if (!label) {
      showToast('请输入工作流名称');
      return;
    }
    const hint = canvasWorkflowHintDraft.trim().slice(0, 80) || source.hint || '自定义工作流';
    const hasCustomOverride = customCanvasWorkflows.some(item => item.id === source.id);
    const nextWorkflow = normalizeCanvasWorkflowTemplate({
      ...cloneDrawerValue(source),
      id: source.id,
      label,
      hint,
      createdAt: Date.now(),
      builtin: false,
    });
    if (!nextWorkflow) {
      showToast('工作流保存失败');
      return;
    }
    setCustomCanvasWorkflows(prev => (
      hasCustomOverride
        ? prev.map(item => item.id === source.id ? nextWorkflow : item)
        : [nextWorkflow, ...prev].slice(0, 24)
    ));
    setCanvasWorkflowEditingId(nextWorkflow.id);
    setCanvasWorkflowNameDraft(nextWorkflow.label);
    setCanvasWorkflowHintDraft(nextWorkflow.hint || '');
    updateCanvasWorkflowModuleNodesForTemplate(nextWorkflow, false);
    showToast(`已更新工作流「${nextWorkflow.label}」`);
  };

  const replaceCanvasWorkflowManagerWithSelection = () => {
    const source = canvasWorkflowTemplates.find(item => item.id === canvasWorkflowEditingId);
    if (!source) {
      showToast('请选择要修改的工作流');
      return;
    }
    const hasCustomOverride = customCanvasWorkflows.some(item => item.id === source.id);
    const label = (canvasWorkflowNameDraft.trim() || source.label).slice(0, 32);
    const draft = buildCanvasWorkflowSaveDraftFromSelection(label);
    if (!draft) return;
    const hint = canvasWorkflowHintDraft.trim().slice(0, 80) || `${draft.nodes.length} 个节点，${draft.aiCount} 个生图节点`;
    const nextWorkflow = normalizeCanvasWorkflowTemplate({
      ...cloneDrawerValue(source),
      id: source.id,
      label,
      hint,
      nodes: draft.nodes,
      createdAt: Date.now(),
      builtin: false,
    });
    if (!nextWorkflow) {
      showToast('工作流结构更新失败');
      return;
    }
    setCustomCanvasWorkflows(prev => (
      hasCustomOverride
        ? prev.map(item => item.id === source.id ? nextWorkflow : item)
        : [nextWorkflow, ...prev].slice(0, 24)
    ));
    setCanvasWorkflowEditingId(nextWorkflow.id);
    setCanvasWorkflowNameDraft(nextWorkflow.label);
    setCanvasWorkflowHintDraft(nextWorkflow.hint || '');
    updateCanvasWorkflowModuleNodesForTemplate(nextWorkflow, true);
    showToast(`已用选中节点更新「${nextWorkflow.label}」`);
  };

  const deleteCanvasWorkflowFromManager = () => {
    const source = canvasWorkflowTemplates.find(item => item.id === canvasWorkflowEditingId);
    if (!source) {
      showToast('请选择要删除的工作流');
      return;
    }
    const isCustom = customCanvasWorkflows.some(item => item.id === source.id);
    if (!isCustom) {
      showToast('内置工作流还没有修改，不能删除');
      return;
    }
    const isBuiltInOverride = CANVAS_BUILT_IN_WORKFLOWS.some(workflow => workflow.id === source.id);
    setConfirmDialog({
      isOpen: true,
      title: isBuiltInOverride ? '恢复内置工作流？' : '删除工作流？',
      message: isBuiltInOverride
        ? `删除「${source.label}」的本地修改后，会恢复为内置工作流。画布上已经放置的模块会保留当前快照。`
        : `删除「${source.label}」后，它会从工作流列表里移除。画布上已经放置的模块会保留当前快照。`,
      onConfirm: () => {},
      actions: [
        {
          label: isBuiltInOverride ? '恢复内置' : '删除',
          onClick: () => {
            setCustomCanvasWorkflows(prev => prev.filter(item => item.id !== source.id));
            const restoredBuiltIn = CANVAS_BUILT_IN_WORKFLOWS.find(workflow => workflow.id === source.id);
            const nextWorkflow = isBuiltInOverride
              ? restoredBuiltIn
              : canvasWorkflowTemplates.find(item => item.id !== source.id) || CANVAS_BUILT_IN_WORKFLOWS[0];
            if (nextWorkflow) {
              setCanvasWorkflowEditingId(nextWorkflow.id);
              setCanvasWorkflowNameDraft(nextWorkflow.label);
              setCanvasWorkflowHintDraft(nextWorkflow.hint || '');
            }
            closeConfirmDialog();
            showToast(isBuiltInOverride ? `已恢复内置工作流「${source.label}」` : `已删除工作流「${source.label}」`);
          },
          className: 'rounded-[16px] bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600',
        },
      ],
    });
  };

  const expandCanvasWorkflowModuleForEdit = (canvasId: string) => {
    const moduleNode = canvasItemsRef.current.find(item => item.id === canvasId);
    const workflow = getCanvasWorkflowTemplateFromNode(moduleNode);
    if (!moduleNode || !workflow) {
      showToast('没有可展开的工作流模块');
      return;
    }
    const { items: rawExpandedItems, idMap } = instantiateCanvasWorkflowTemplateItems(
      workflow,
      { x: moduleNode.x, y: moduleNode.y },
      moduleNode.inputs || []
    );
    const runtimeSnapshots = normalizeCanvasWorkflowRuntimeSnapshots(moduleNode.ai?.workflowRuntime);
    const restoredItems = applyCanvasWorkflowRuntimeSnapshots(workflow, rawExpandedItems, idMap, runtimeSnapshots);
    const groupId = `workflow_group_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const expandedItems = restoredItems.map(item => {
      const templateEntry = Array.from(idMap.entries()).find(([, runtimeId]) => runtimeId === item.id);
      const templateId = templateEntry?.[0] || item.id;
      return {
        ...item,
        workflowGroup: {
          groupId,
          templateId,
          workflowId: workflow.id,
          workflowLabel: workflow.label,
          workflowHint: workflow.hint,
          workflowBuiltin: workflow.builtin,
          module: cloneDrawerValue(moduleNode),
          expandedAt: Date.now(),
        } satisfies CanvasWorkflowExpandedGroup,
      };
    });
    if (expandedItems.length === 0) {
      showToast('工作流内部没有可编辑节点');
      return;
    }
    const terminalIds = getCanvasWorkflowTerminalNodeTemplates(workflow)
      .map(node => idMap.get(node.id))
      .filter((id): id is string => !!id);
    pushCanvasUndoSnapshot('展开工作流');
    updateCanvasItemsImmediate(prev => {
      const nextItems = prev
        .filter(item => item.id !== moduleNode.id)
        .map(item => {
          const inputs = item.inputs || [];
          if (!inputs.includes(moduleNode.id)) return item;
          const replacementInputs = terminalIds.length > 0 ? terminalIds : [];
          return {
            ...item,
            inputs: Array.from(new Set(inputs.flatMap(inputId => (
              inputId === moduleNode.id ? replacementInputs : [inputId]
            )))),
          };
        });
      return [...nextItems, ...expandedItems];
    });
    updateCanvasSelection(expandedItems.map(item => item.id));
    showToast(`已展开「${workflow.label}」，可右键内部节点折叠回工作流`);
  };

  const buildCanvasWorkflowTemplateFromExpandedGroup = (
    groupItems: CanvasImageItem[],
    group: CanvasWorkflowExpandedGroup
  ) => {
    const bounds = getCanvasBoundsFromItems(groupItems);
    if (!bounds) return null;
    const templateIdByCanvasId = new Map(groupItems.map(item => [
      item.id,
      getCanvasWorkflowGroup(item)?.templateId || item.id,
    ]));
    const idMap = new Map<string, string>();
    templateIdByCanvasId.forEach((templateId, canvasId) => {
      idMap.set(templateId, canvasId);
    });
    const groupCanvasIds = new Set(groupItems.map(item => item.id));
    const externalInputIds = Array.from(new Set(groupItems.flatMap(item => (
      (item.inputs || []).filter(inputId => !groupCanvasIds.has(inputId))
    ))));
    const nodes = groupItems.map((item): CanvasWorkflowNodeTemplate => {
      const templateId = templateIdByCanvasId.get(item.id) || item.id;
      const savedItem = stripHeavyDataThumbnail(item.item);
      const safeUrl = savedItem.url && isDataImageSourceValue(savedItem.url) ? undefined : savedItem.url;
      const safeThumbnail = savedItem.thumbnail && isDataImageSourceValue(savedItem.thumbnail) ? undefined : savedItem.thumbnail;
      const safeSourceUrl = savedItem.sourceUrl && isDataImageSourceValue(savedItem.sourceUrl) ? undefined : savedItem.sourceUrl;
      const safeOriginalUrl = savedItem.originalUrl && isDataImageSourceValue(savedItem.originalUrl) ? undefined : savedItem.originalUrl;
      return {
        id: templateId,
        x: item.x - bounds.x,
        y: item.y - bounds.y,
        width: item.width,
        height: item.height,
        item: {
          ...savedItem,
          id: templateId,
          type: item.item.type,
          content: item.item.content || '',
          name: item.item.name,
          createdAt: 0,
          isQuickAccess: false,
          url: safeUrl,
          thumbnail: safeThumbnail,
          sourceUrl: safeSourceUrl,
          originalUrl: safeOriginalUrl,
        },
        inputs: (item.inputs || [])
          .map(inputId => templateIdByCanvasId.get(inputId))
          .filter((inputId): inputId is string => !!inputId),
        ai: item.ai
          ? {
            ...cloneDrawerValue(item.ai),
            status: 'idle' as const,
            error: undefined,
            generatedAt: undefined,
            outputs: [],
            workflow: undefined,
            workflowRuntime: undefined,
          }
          : undefined,
      };
    });
    const workflow = normalizeCanvasWorkflowTemplate({
      id: group.workflowId,
      label: group.workflowLabel,
      hint: group.workflowHint,
      nodes,
      builtin: group.workflowBuiltin,
      createdAt: Date.now(),
    });
    return workflow ? { workflow, bounds, externalInputIds, idMap } : null;
  };

  const getComparableCanvasWorkflowTemplate = (workflow: CanvasWorkflowTemplate) => ({
    nodes: workflow.nodes
      .map(node => ({
        id: node.id,
        x: Math.round(node.x),
        y: Math.round(node.y),
        width: Math.round(node.width),
        height: Math.round(node.height),
        item: {
          type: node.item.type,
          content: node.item.content || '',
          name: node.item.name || '',
          remark: node.item.remark || '',
        },
        inputs: [...(node.inputs || [])].sort(),
        ai: node.ai
          ? {
            type: node.ai.type,
            provider: node.ai.provider,
            model: node.ai.model,
            prompt: node.ai.prompt || '',
            presetId: node.ai.presetId || '',
            presetLabel: node.ai.presetLabel || '',
            presetPrompt: node.ai.presetPrompt || '',
            aspectRatio: node.ai.aspectRatio || '',
            outputFormat: node.ai.outputFormat || '',
            count: node.ai.count || 1,
          }
          : null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });

  const hasCanvasWorkflowTemplateChanged = (
    currentWorkflow: CanvasWorkflowTemplate,
    originalWorkflow: CanvasWorkflowTemplate
  ) => (
    JSON.stringify(getComparableCanvasWorkflowTemplate(currentWorkflow)) !==
    JSON.stringify(getComparableCanvasWorkflowTemplate(originalWorkflow))
  );

  const createCanvasWorkflowModuleOutputsFromExpandedGroup = (
    moduleNode: CanvasImageItem,
    workflow: CanvasWorkflowTemplate,
    groupItems: CanvasImageItem[],
    idMap: Map<string, string>
  ) => {
    const drafts = createCanvasWorkflowOutputDrafts(moduleNode, workflow);
    const slots = getCanvasWorkflowOutputSlotTemplates(workflow);
    return drafts.map((draft, index) => {
      const slot = slots[index];
      const canvasId = slot ? idMap.get(slot.node.id) : '';
      const source = canvasId ? groupItems.find(item => item.id === canvasId) : null;
      const output = source?.ai?.outputs?.[slot?.index || 0];
      return output
        ? { ...draft, ...cloneDrawerValue(output), id: draft.id, name: draft.name }
        : draft;
    });
  };

  const exportCurrentCanvasWorkflow = () => {
    const workflow = canvasWorkflowTemplates.find(item => item.id === canvasWorkflowEditingId);
    if (!workflow) {
      showToast('请选择要导出的工作流');
      return;
    }
    void exportCanvasTemplateFile({ workflows: [workflow] }, `${workflow.label || 'canvas-workflow'}.json`);
  };

  const exportAllCustomCanvasWorkflows = () => {
    void exportCanvasTemplateFile({ workflows: customCanvasWorkflows }, 'canvas-workflows.json');
  };

  const collapseCanvasWorkflowGroupNow = (
    group: CanvasWorkflowExpandedGroup,
    saveTemplate: boolean,
    changed: boolean
  ) => {
    const groupItems = getCanvasWorkflowExpandedGroupItems(group.groupId);
    if (groupItems.length === 0) {
      showToast('没有找到可折叠的工作流节点');
      return;
    }
    const built = buildCanvasWorkflowTemplateFromExpandedGroup(groupItems, group);
    if (!built) {
      showToast('工作流折叠失败');
      return;
    }
    const originalWorkflow = getCanvasWorkflowTemplateFromNode(group.module) || built.workflow;
    let workflowForModule: CanvasWorkflowTemplate = changed ? { ...built.workflow, builtin: false } : originalWorkflow;
    if (saveTemplate && changed) {
      const isCustom = customCanvasWorkflows.some(item => item.id === originalWorkflow.id);
      workflowForModule = {
        ...built.workflow,
        id: isCustom ? originalWorkflow.id : `custom-workflow-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        label: group.workflowLabel,
        hint: group.workflowHint,
        builtin: false,
        createdAt: Date.now(),
      };
      setCustomCanvasWorkflows(prev => (
        isCustom
          ? prev.map(item => item.id === originalWorkflow.id ? workflowForModule : item)
          : [workflowForModule, ...prev].slice(0, 24)
      ));
    } else if (changed) {
      workflowForModule = {
        ...workflowForModule,
        id: `local-workflow-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        builtin: false,
      };
    }

    const moduleDraft = buildCanvasWorkflowModuleNode(workflowForModule, { x: built.bounds.x, y: built.bounds.y }, built.externalInputIds);
    if (!moduleDraft) {
      showToast('工作流模块恢复失败');
      return;
    }
    const moduleNode: CanvasImageItem = {
      ...moduleDraft,
      id: group.module.id,
      item: {
        ...moduleDraft.item,
        id: group.module.item.id,
        createdAt: group.module.item.createdAt,
      },
      ai: {
        ...moduleDraft.ai,
        type: 'workflow' as const,
      },
    };
    const outputs = createCanvasWorkflowModuleOutputsFromExpandedGroup(moduleNode, workflowForModule, groupItems, built.idMap);
    const successCount = outputs.filter(output => output.status === 'success' && getCanvasAiOutputDisplaySource(output)).length;
    const nextStatus = successCount > 0
      ? (successCount === outputs.length ? 'success' as const : 'error' as const)
      : 'idle' as const;
    const runtimeSnapshots = createCanvasWorkflowRuntimeSnapshots(workflowForModule, groupItems, built.idMap);
    const restoredModule: CanvasImageItem = {
      ...moduleNode,
      ai: {
        ...(moduleNode.ai || { type: 'workflow' as const }),
        type: 'workflow' as const,
        outputs,
        workflowRuntime: runtimeSnapshots,
        status: nextStatus,
        error: nextStatus === 'error' ? '部分内部输出缺失' : undefined,
        generatedAt: successCount > 0 ? Date.now() : undefined,
      },
    };
    const groupCanvasIds = new Set(groupItems.map(item => item.id));
    canvasWorkflowSingleEditGroupIdsRef.current.delete(group.groupId);
    setCanvasWorkflowSingleEditGroupIds(prev => prev.filter(groupId => groupId !== group.groupId));
    pushCanvasUndoSnapshot('折叠工作流');
    updateCanvasItemsImmediate(prev => {
      const nextItems = prev
        .filter(item => !groupCanvasIds.has(item.id))
        .map(item => {
          const inputs = item.inputs || [];
          if (!inputs.some(inputId => groupCanvasIds.has(inputId))) return item;
          return {
            ...item,
            inputs: Array.from(new Set(inputs.map(inputId => groupCanvasIds.has(inputId) ? restoredModule.id : inputId))),
          };
        });
      return [...nextItems, restoredModule];
    });
    updateCanvasSelection([restoredModule.id]);
    showToast(saveTemplate && changed
      ? `已保存并折叠工作流「${workflowForModule.label}」`
      : `已折叠工作流「${workflowForModule.label}」`);
  };

  const collapseCanvasWorkflowGroup = (canvasId: string) => {
    const sourceItem = canvasItemsRef.current.find(item => item.id === canvasId);
    const group = getCanvasWorkflowGroup(sourceItem);
    if (!group) {
      showToast('这个节点不属于已展开工作流');
      return;
    }
    const groupItems = getCanvasWorkflowExpandedGroupItems(group.groupId);
    const built = buildCanvasWorkflowTemplateFromExpandedGroup(groupItems, group);
    const originalWorkflow = getCanvasWorkflowTemplateFromNode(group.module);
    if (!built || !originalWorkflow) {
      showToast('工作流折叠失败');
      return;
    }
    const changed = hasCanvasWorkflowTemplateChanged(built.workflow, originalWorkflow);
    if (!changed) {
      collapseCanvasWorkflowGroupNow(group, false, false);
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: '保存工作流修改？',
      message: `「${group.workflowLabel}」的内部节点有调整。保存会更新工作流模板，但不会保存新生成的图片结果。`,
      onConfirm: () => {},
      actions: [
        {
          label: '不保存折叠',
          onClick: () => {
            closeConfirmDialog();
            collapseCanvasWorkflowGroupNow(group, false, true);
          },
          className: 'rounded-[16px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
        },
        {
          label: '保存并折叠',
          onClick: () => {
            closeConfirmDialog();
            collapseCanvasWorkflowGroupNow(group, true, true);
          },
          className: 'rounded-[16px] bg-emerald-500 px-3 py-1.5 text-xs font-black text-white transition-colors hover:bg-emerald-400 dark:bg-emerald-400 dark:text-stone-950 dark:hover:bg-emerald-300',
        },
      ],
    });
  };

  const updateCanvasAiGeneratorData = (canvasId: string, patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => {
    updateCanvasItemsImmediate(prev => prev.map(item => (
      item.id === canvasId
        ? (() => {
          const nextAi = {
            ...(item.ai || {}),
            ...patch,
            type: patch.type || item.ai?.type || 'image-generator',
          } as NonNullable<CanvasImageItem['ai']>;
          const nextItem = content === undefined ? item.item : {
            ...item.item,
            content,
            name: content.trim().split(/\r?\n/)[0]?.slice(0, 24) || (item.ai?.presetLabel ? `AI ${item.ai.presetLabel}` : getCanvasAiNodeTitle(item.ai)),
          };
          const nextCanvasItem = {
            ...item,
            ai: nextAi,
            item: nextItem,
          };
          if (isCanvasAiGeneratorType(item.ai?.type) && (patch.aspectRatio !== undefined || patch.count !== undefined || content !== undefined)) {
            const hasOutputPreview = (item.ai.outputs || []).length > 0;
            const promptExpanded = canvasAiPromptEditingId === item.id;
            const oldSize = getCanvasAiNodeAutoSize({
              type: getCanvasAiNodeAutoSizeType(item.ai),
              aspectRatio: item.ai.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
              count: item.ai.count || CANVAS_AI_DEFAULT_COUNT,
              hasPreset: !!item.ai.presetLabel,
              hasError: !!item.ai.error,
              promptText: item.item.content || '',
              promptExpanded,
              showOutputPreview: hasOutputPreview,
            });
            const nextSize = getCanvasAiNodeAutoSize({
              type: getCanvasAiNodeAutoSizeType(nextAi),
              aspectRatio: nextAi.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
              count: nextAi.count || CANVAS_AI_DEFAULT_COUNT,
              hasPreset: !!nextAi.presetLabel,
              hasError: !!nextAi.error,
              promptText: nextItem.content || '',
              promptExpanded,
              showOutputPreview: hasOutputPreview,
            });
            const nodeScale = Math.max(1, Math.min(item.width / oldSize.width, item.height / oldSize.height) || 1);
            return {
              ...nextCanvasItem,
              width: nextSize.width * nodeScale,
              height: nextSize.height * nodeScale,
            };
          }
          return nextCanvasItem;
        })()
      : item
    )));
  };

  const resizeCanvasAiPromptEditor = (canvasId: string, expanded: boolean, previousExpanded?: boolean) => {
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== canvasId || !isCanvasAiGeneratorType(item.ai?.type)) return item;
      const hasOutputPreview = (item.ai.outputs || []).length > 0;
      const oldExpanded = previousExpanded ?? canvasAiPromptEditingId === item.id;
      const oldSize = getCanvasAiNodeAutoSize({
        type: getCanvasAiNodeAutoSizeType(item.ai),
        aspectRatio: item.ai.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
        count: item.ai.count || CANVAS_AI_DEFAULT_COUNT,
        hasPreset: !!item.ai.presetLabel,
        hasError: !!item.ai.error,
        promptText: item.item.content || '',
        promptExpanded: oldExpanded,
        showOutputPreview: hasOutputPreview,
      });
      const nextSize = getCanvasAiNodeAutoSize({
        type: getCanvasAiNodeAutoSizeType(item.ai),
        aspectRatio: item.ai.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
        count: item.ai.count || CANVAS_AI_DEFAULT_COUNT,
        hasPreset: !!item.ai.presetLabel,
        hasError: !!item.ai.error,
        promptText: item.item.content || '',
        promptExpanded: expanded,
        showOutputPreview: hasOutputPreview,
      });
      const nodeScale = Math.max(1, Math.min(item.width / oldSize.width, item.height / oldSize.height) || 1);
      return {
        ...item,
        width: nextSize.width * nodeScale,
        height: nextSize.height * nodeScale,
      };
    }));
  };

  const setCanvasWorkflowOutputMode = (canvasId: string, mode: 'final' | 'all') => {
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== canvasId || item.ai?.type !== 'workflow') return item;
      const workflow = getCanvasWorkflowTemplateFromNode(item);
      if (!workflow) return item;
      const currentOutputs = getCanvasAiOutputPreviewSlots(item);
      const nextItem: CanvasImageItem = {
        ...item,
        ai: {
          ...item.ai,
          workflowOutputMode: mode,
        },
      };
      const nextOutputs = getCanvasAiOutputPreviewSlots(nextItem);
      const getOutputAspectRatio = (outputs: CanvasAiGeneratedOutput[]) => (
        outputs[0]?.width && outputs[0]?.height
          ? `${outputs[0].width}:${outputs[0].height}`
          : item.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO
      );
      const currentSize = getCanvasAiNodeAutoSize({
        type: 'workflow',
        aspectRatio: getOutputAspectRatio(currentOutputs),
        outputCount: currentOutputs.length || undefined,
        hasError: !!item.ai?.error,
        showOutputPreview: true,
      });
      const nextSize = getCanvasAiNodeAutoSize({
        type: 'workflow',
        aspectRatio: getOutputAspectRatio(nextOutputs),
        outputCount: nextOutputs.length || undefined,
        hasError: !!item.ai?.error,
        showOutputPreview: true,
      });
      const currentScale = Math.min(item.width / currentSize.width, item.height / currentSize.height) || 1;
      const nextScale = mode === 'all' ? Math.max(1, currentScale) : currentScale;
      return {
        ...nextItem,
        width: nextSize.width * nextScale,
        height: nextSize.height * nextScale,
      };
    }));
    showToast(mode === 'all' ? '已显示工作流全部节点输出' : '已显示工作流最终输出');
  };

  const connectSelectedCanvasItemsToGenerator = (targetId: string) => {
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!canUseCanvasItemAsAiTarget(target)) {
      showToast('目标节点不能接入输入');
      return;
    }
    const sourceIds = canvasSelectedIdsRef.current
      .filter(id => id !== targetId)
      .filter(id => {
        const source = canvasItemsRef.current.find(item => item.id === id);
        return canUseCanvasItemAsAiInput(source);
      });
    if (sourceIds.length === 0) {
      showToast('先多选要接入的图片或文字节点');
      return;
    }
    pushCanvasUndoSnapshot('连接 AI 输入');
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== targetId) return item;
      const nextInputs = Array.from(new Set([...(item.inputs || []), ...sourceIds]));
      return { ...item, inputs: nextInputs };
    }));
    updateCanvasSelection([targetId]);
    showToast(`已连接 ${sourceIds.length} 个输入节点`);
  };

  const connectCanvasItems = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return false;
    const source = canvasItemsRef.current.find(item => item.id === sourceId);
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!source || !target || !canUseCanvasItemAsAiTarget(target) || !canUseCanvasItemAsAiInput(source)) return false;
    if ((target.inputs || []).includes(sourceId)) {
      updateCanvasSelection([targetId]);
      return true;
    }
    pushCanvasUndoSnapshot('连接 AI 输入');
    updateCanvasItemsImmediate(prev => prev.map(item => (
      item.id === targetId
        ? { ...item, inputs: Array.from(new Set([...(item.inputs || []), sourceId])) }
        : item
    )));
    updateCanvasSelection([targetId]);
    showToast(target.ai?.type === 'workflow' ? '已连接到工作流模块' : `已连接到 ${getCanvasAiNodeTitle(target.ai)}`);
    return true;
  };

  const connectCanvasItemsToGenerator = (sourceIds: string[], targetId: string) => {
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return false;
    const validSourceIds = Array.from(new Set(sourceIds))
      .filter(sourceId => sourceId && sourceId !== targetId)
      .filter(sourceId => {
        const source = canvasItemsRef.current.find(item => item.id === sourceId);
        return canUseCanvasItemAsAiInput(source);
      });
    if (validSourceIds.length === 0) return false;

    const previousInputs = target.inputs || [];
    const nextInputs = Array.from(new Set([...previousInputs, ...validSourceIds]));
    const addedCount = nextInputs.length - previousInputs.length;
    if (addedCount <= 0) {
      updateCanvasSelection([targetId]);
      showToast('这些输入已经连接过了');
      return true;
    }

    pushCanvasUndoSnapshot('连接 AI 输入');
    updateCanvasItemsImmediate(prev => prev.map(item => (
      item.id === targetId ? { ...item, inputs: nextInputs } : item
    )));
    updateCanvasSelection([targetId]);
    showToast(`已连接 ${addedCount} 个输入节点`);
    return true;
  };

  const addCanvasAiGeneratorNodeForSources = (sourceIds: string[], world: { x: number; y: number }) => {
    const validSourceIds = Array.from(new Set(sourceIds))
      .filter(sourceId => {
        const source = canvasItemsRef.current.find(item => item.id === sourceId);
        return canUseCanvasItemAsAiInput(source);
      });
    if (validSourceIds.length === 0) return;
    const canvasItem = buildCanvasAiGeneratorNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, undefined, validSourceIds);
    if (appendCanvasItems([canvasItem], '新增 AI 生图节点') > 0) {
      updateCanvasSelection([canvasItem.id]);
      showToast(`已新建 AI 生图节点，并连接 ${validSourceIds.length} 个输入`);
    }
  };

  const addCanvasAiVideoGeneratorNodeForSources = (sourceIds: string[], world: { x: number; y: number }) => {
    const validSourceIds = Array.from(new Set(sourceIds))
      .filter(sourceId => {
        const source = canvasItemsRef.current.find(item => item.id === sourceId);
        return canUseCanvasItemAsAiInput(source);
      });
    if (validSourceIds.length === 0) return;
    const canvasItem = buildCanvasAiGeneratorNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, undefined, validSourceIds, 'video');
    if (appendCanvasItems([canvasItem], '新增 AI 视频节点') > 0) {
      updateCanvasSelection([canvasItem.id]);
      showToast(`已新建 AI 视频节点，并连接 ${validSourceIds.length} 个输入`);
    }
  };

  const addCanvasTextInputForGenerator = (targetId: string, world: { x: number; y: number }) => {
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;
    const item: BufferItem = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'text',
      content: '',
      name: '文字说明',
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const canvasItem: CanvasImageItem = {
      id: `canvas_${item.id}`,
      item,
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
      width: 240,
      height: 160,
    };
    pushCanvasUndoSnapshot('新增文字说明输入');
    updateCanvasItemsImmediate(prev => ([
      ...prev.map(current => (
        current.id === targetId
          ? { ...current, inputs: Array.from(new Set([...(current.inputs || []), canvasItem.id])) }
          : current
      )),
      canvasItem,
    ]));
    updateCanvasSelection([canvasItem.id]);
    showToast('已添加文字说明并连接到节点');
  };

  const chooseLocalImagesForCanvasGenerator = (targetId: string) => {
    pendingCanvasUploadTargetIdRef.current = targetId;
    setCanvasInputMenuForId(null);
    canvasUploadInputRef.current?.click();
  };

  const handleCanvasGeneratorUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const targetId = pendingCanvasUploadTargetIdRef.current;
    pendingCanvasUploadTargetIdRef.current = null;
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!targetId || files.length === 0) return;

    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;

    const imageFiles = files.filter(file => file.type.startsWith('image/') || isCanvasImageFileName(file.name));
    if (imageFiles.length === 0) {
      showToast('请选择图片文件');
      return;
    }

    const created = await Promise.all(imageFiles.map((file, index) => createCanvasImageItemFromFile(file, index)));
    const images = created.filter((item): item is CanvasImageItem => !!item).map((item, index) => ({
      ...item,
      x: Math.max(24, target.x - item.width - 72 - (index % 2) * 22),
      y: Math.max(24, target.y + index * 42),
    }));
    if (images.length === 0) {
      showToast('图片读取失败');
      return;
    }

    const addedCount = appendCanvasItems(images, '添加 AI 输入图片', false);
    if (addedCount <= 0) return;
    connectCanvasItemsToGenerator(images.map(item => item.id), targetId);
  };

  const chooseLocalVideosForCanvasGenerator = async (targetId: string) => {
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;
    if (target.ai?.type !== 'video-generator' || target.ai?.videoInputMode === 'FLF') {
      showToast('只有视频节点的参考图模式支持参考视频');
      return;
    }

    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] }],
        title: '选择参考视频',
      });
      const paths = (Array.isArray(selected) ? selected : selected ? [selected] : [])
        .filter((value): value is string => typeof value === 'string' && !!value);
      if (paths.length === 0) return;

      const created = await Promise.all(paths.slice(0, 1).map((path, index) => createCanvasVideoItemFromPath(path, index)));
      const videos = created.filter((item): item is CanvasImageItem => !!item).map((item, index) => ({
        ...item,
        x: Math.max(24, target.x - item.width - 72 - (index % 2) * 22),
        y: Math.max(24, target.y + 120 + index * 42),
      }));
      if (videos.length === 0) {
        showToast('视频读取失败');
        return;
      }

      const addedCount = appendCanvasItems(videos, '添加 AI 参考视频', false);
      if (addedCount <= 0) return;
      connectCanvasItemsToGenerator(videos.map(item => item.id), targetId);
    } catch (err) {
      console.warn('添加 AI 参考视频失败:', err);
      showToast('添加参考视频失败');
    }
  };

  const startPickCanvasImageForGenerator = (targetId: string) => {
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;
    const allowVideoReference = target.ai?.type === 'video-generator' && target.ai?.videoInputMode !== 'FLF';
    setCanvasInputMenuForId(null);
    setCanvasContextMenu(null);
    setCanvasInputPickTargetId(targetId);
    updateCanvasSelection([targetId]);
    showToast(allowVideoReference
      ? '点击画布里的图片、视频、生图/视频节点或工作流模块作为输入，Esc 取消'
      : '点击画布里的图片、生图节点或工作流模块作为输入，Esc 取消');
  };

  const pickCanvasImageForGenerator = (sourceId: string, targetId: string) => {
    const source = canvasItemsRef.current.find(item => item.id === sourceId);
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    const allowVideoReference = target?.ai?.type === 'video-generator' && target.ai.videoInputMode !== 'FLF';
    const canPickSource = !!source && (
      source.item.type === 'image'
      || source.ai?.type === 'image-generator'
      || source.ai?.type === 'workflow'
      || (allowVideoReference && (source.item.type === 'video' || source.ai?.type === 'video-generator'))
    );
    if (!canPickSource) {
      showToast(allowVideoReference ? '请选择图片、视频、生图/视频节点或工作流模块' : '请选择图片节点、生图节点或工作流模块');
      return false;
    }
    const connected = connectCanvasItems(sourceId, targetId);
    if (connected) setCanvasInputPickTargetId(null);
    return connected;
  };

  const startCanvasConnectionDrag = (event: React.PointerEvent, sourceId: string) => {
    if (event.button !== 0) return;
    const source = canvasItemsRef.current.find(item => item.id === sourceId);
    if (!source || !canUseCanvasItemAsAiInput(source)) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasInteractionActive(true);
    const sourceBox = getCanvasItemRenderedBox(source);
    const fromX = sourceBox.x + sourceBox.width + CANVAS_CONNECTION_HANDLE_OUTSET;
    const fromY = sourceBox.y + sourceBox.height / 2;
    const sourceIds = canvasSelectedIdsRef.current.includes(sourceId)
      ? canvasSelectedIdsRef.current.filter(id => {
        const item = canvasItemsRef.current.find(canvasItem => canvasItem.id === id);
        return canUseCanvasItemAsAiInput(item);
      })
      : [sourceId];
    canvasConnectionDragRef.current = {
      fromId: sourceId,
      sourceIds,
      pointerId: event.pointerId,
      fromX,
      fromY,
    };
    setCanvasConnectionDraft({ fromId: sourceId, sourceIds, fromX, fromY, toX: fromX, toY: fromY });

    const onMove = (moveEvent: PointerEvent) => {
      const draft = canvasConnectionDragRef.current;
      if (!draft) return;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      autoScrollCanvasNearEdge(moveEvent);
      const point = getCanvasPointFromClient(moveEvent.clientX, moveEvent.clientY);
      setCanvasConnectionDraft({
        fromId: draft.fromId,
        sourceIds: draft.sourceIds,
        fromX: draft.fromX,
        fromY: draft.fromY,
        toX: point.x,
        toY: point.y,
      });
    };

    const finish = (upEvent: PointerEvent) => {
      const draft = canvasConnectionDragRef.current;
      canvasConnectionDragRef.current = null;
      setCanvasConnectionDraft(null);
      setCanvasInteractionActive(false);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      if (!draft) return;
      const target = upEvent.target as HTMLElement | null;
      const targetId = target?.closest('[data-canvas-ai-input-id]')?.getAttribute('data-canvas-ai-input-id') || '';
      if (targetId) {
        if (draft.sourceIds.length === 1) connectCanvasItems(draft.fromId, targetId);
        else connectCanvasItemsToGenerator(draft.sourceIds, targetId);
      } else {
        const point = getCanvasPointFromClient(upEvent.clientX, upEvent.clientY);
        setCanvasContextMenu({
          x: upEvent.clientX,
          y: upEvent.clientY,
          worldX: point.x,
          worldY: point.y,
          type: 'source-connection',
          sourceId: draft.fromId,
          sourceIds: draft.sourceIds,
        });
      }
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);
  };

  const startCanvasInputActionDrag = (event: React.PointerEvent, targetId: string) => {
    if (event.button !== 0 || canvasConnectionDraft) return;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasInteractionActive(true);
    setCanvasContextMenu(null);
    setCanvasInputMenuForId(null);
    const targetBox = getCanvasItemRenderedBox(target);
    const fromX = targetBox.x - CANVAS_CONNECTION_HANDLE_OUTSET;
    const fromY = targetBox.y + targetBox.height / 2;
    canvasInputActionDragRef.current = {
      targetId,
      pointerId: event.pointerId,
      fromX,
      fromY,
    };
    setCanvasInputActionDraft({ targetId, fromX, fromY, toX: fromX, toY: fromY });

    const onMove = (moveEvent: PointerEvent) => {
      const draft = canvasInputActionDragRef.current;
      if (!draft) return;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      autoScrollCanvasNearEdge(moveEvent);
      const point = getCanvasPointFromClient(moveEvent.clientX, moveEvent.clientY);
      setCanvasInputActionDraft({
        targetId: draft.targetId,
        fromX: draft.fromX,
        fromY: draft.fromY,
        toX: point.x,
        toY: point.y,
      });
    };

    const finish = (upEvent: PointerEvent) => {
      const draft = canvasInputActionDragRef.current;
      canvasInputActionDragRef.current = null;
      setCanvasInputActionDraft(null);
      setCanvasInteractionActive(false);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      if (!draft) return;
      const point = getCanvasPointFromClient(upEvent.clientX, upEvent.clientY);
      setCanvasContextMenu({
        x: upEvent.clientX,
        y: upEvent.clientY,
        worldX: point.x,
        worldY: point.y,
        type: 'target-input',
        targetId: draft.targetId,
      });
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);
  };

  const disconnectCanvasInput = (targetId: string, inputId: string) => {
    if (removeCanvasConnection(targetId, inputId, '移除 AI 输入')) return;
    pushCanvasUndoSnapshot('移除 AI 输入');
    updateCanvasItemsImmediate(prev => prev.map(item => (
      item.id === targetId ? { ...item, inputs: (item.inputs || []).filter(id => id !== inputId) } : item
    )));
  };

  const getCanvasAiRerunNodePosition = (source: CanvasImageItem) => {
    const gap = 64;
    const step = 44;
    let x = Math.max(24, source.x + source.width + gap);
    let y = Math.max(24, source.y);
    const items = canvasItemsRef.current;

    for (let attempt = 0; attempt < 18; attempt += 1) {
      const box = { x, y, width: source.width, height: source.height };
      const overlaps = items.some(item => item.id !== source.id && canvasRectsIntersect(box, item));
      if (!overlaps) return { x, y };
      y += step;
      if (attempt === 8) {
        x += step;
        y = Math.max(24, source.y + step);
      }
    }

    return { x, y };
  };

  const cloneCanvasAiGeneratorForRerun = (source: CanvasImageItem) => {
    if (!isCanvasAiGeneratorType(source.ai?.type)) return null;
    const nextBufferId = Math.random().toString(36).substring(2, 9);
    const nextCanvasId = `canvas_ai_${nextBufferId}`;
    const pos = getCanvasAiRerunNodePosition(source);
    const now = Date.now();
    return {
      ...cloneDrawerValue(source),
      id: nextCanvasId,
      x: pos.x,
      y: pos.y,
      item: {
        ...cloneDrawerValue(source.item),
        id: nextBufferId,
        createdAt: now,
      },
      inputs: [...(source.inputs || [])],
      ai: {
        ...cloneDrawerValue(source.ai),
        type: source.ai.type,
        status: 'idle' as const,
        error: undefined,
        generatedAt: undefined,
        outputs: [],
      },
    } as CanvasImageItem;
  };

  const runCanvasAiGeneratorTarget = async (
    target: CanvasImageItem,
    options: {
      sourceItems?: () => CanvasImageItem[];
      updateAi: (patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => void;
      forceUpdateAi?: (patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => void;
      getLatestTarget?: () => CanvasImageItem | undefined;
      selectTarget?: () => void;
      showResultToast?: boolean;
      toastLabel?: string;
    }
  ) => {
    if (!isCanvasAiGeneratorType(target.ai?.type)) return [] as CanvasAiGeneratedOutput[];

    const mediaType = getCanvasAiMediaType(target.ai);
    const provider = mediaType === 'video' ? 'xais-chat' : normalizeCanvasAiProvider(target.ai.provider || canvasAiProvider);
    const apiKey = (provider === canvasAiProvider ? canvasAiApiKey : getStoredCanvasAiApiKey(provider)).trim();
    const getSourceItems = options.sourceItems || (() => canvasItemsRef.current);
    const manualPrompt = (target.item.content || (target.ai.presetPrompt ? '' : target.ai.prompt || '')).trim();
    const promptParts = [
      ...getCanvasTextInputsForNode(target, getSourceItems()),
      target.ai.presetPrompt || '',
      manualPrompt,
    ].map(text => text.trim()).filter(Boolean);
    const prompt = promptParts.join('\n\n');
    if (!prompt) {
      (options.forceUpdateAi || options.updateAi)({ status: 'error', error: mediaType === 'video' ? '请输入视频提示词，或连接一个文字节点' : '请输入提示词，或连接一个文字节点' });
      return [] as CanvasAiGeneratedOutput[];
    }
    if (!apiKey) {
      (options.forceUpdateAi || options.updateAi)({ status: 'error', error: '请先在 AI 设置里填写 API Key' });
      return [] as CanvasAiGeneratedOutput[];
    }

    const outputDrafts = createCanvasAiOutputDrafts(target, prompt);
    let currentOutputs = outputDrafts;
    const setCanvasAiOutputs = (
      outputs: CanvasAiGeneratedOutput[],
      patch: Partial<NonNullable<CanvasImageItem['ai']>> = {}
    ) => {
      currentOutputs = outputs;
      options.updateAi({ outputs, ...patch });
    };
    const forceCanvasAiOutputs = (
      outputs: CanvasAiGeneratedOutput[],
      patch: Partial<NonNullable<CanvasImageItem['ai']>> = {}
    ) => {
      currentOutputs = outputs;
      (options.forceUpdateAi || options.updateAi)({ outputs, ...patch });
    };
    options.updateAi({
      status: 'working',
      error: undefined,
      prompt: manualPrompt,
      outputs: currentOutputs,
      generatedAt: Date.now(),
    });
    let temporaryCloudflaredShareIds: string[] = [];
    try {
      const requestModel = target.ai.model || getCanvasAiDefaultModel(provider, mediaType);
      const isXaisWorkerRequest = mediaType === 'video' || (provider === 'xais-chat' && isCanvasAiXaisWorkerModel(requestModel));
      const useDirectReferenceImages = provider === 'openai-compatible'
        || (provider === 'xais-chat' && !isXaisWorkerRequest);
      const inputMode = provider === 'openai-compatible'
        || (provider === 'xais-chat' && !isXaisWorkerRequest)
        ? 'stable'
        : 'remote-first';
      const preparedInputs = await getCanvasImageInputsForNode(
        target,
        inputMode,
        isXaisWorkerRequest ? 'remote-only' : useDirectReferenceImages ? 'direct' : 'auto',
        getSourceItems()
      );
      let inputImages = preparedInputs.images;
      temporaryCloudflaredShareIds = preparedInputs.temporaryShareIds;
      const requestedCount = currentOutputs.length || clamp(Math.round(Number(target.ai.count) || CANVAS_AI_DEFAULT_COUNT), 1, CANVAS_AI_MAX_OUTPUT_COUNT);
      let generateOptions = {
        provider,
        apiKey,
        endpoint: getCanvasAiEndpointForRequest(
          provider,
          provider === canvasAiProvider ? canvasAiEndpoint : getStoredCanvasAiEndpoint(provider)
        ),
        prompt,
        model: requestModel,
        inputImages,
        aspectRatio: target.ai.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
        resolution: mediaType === 'video' ? target.ai.resolution || CANVAS_AI_DEFAULT_VIDEO_RESOLUTION : target.ai.resolution,
        outputFormat: target.ai.outputFormat || CANVAS_AI_DEFAULT_OUTPUT_FORMAT,
        duration: target.ai.duration || CANVAS_AI_DEFAULT_VIDEO_DURATION,
        inputMode: target.ai.videoInputMode || 'REF',
        count: 1,
      };
      const generatedOutputs: CanvasAiGeneratedOutput[] = [];
      const seenGeneratedUrls = new Set<string>();
      let drawerUndoPushed = false;
      let lastPartialError: unknown = null;
      let didRetryWithStableInputs = false;
      let xaisReferenceRetryCount = 0;

      const retryWithStableInputs = async (cause: unknown) => {
        if (isXaisWorkerRequest) return false;
        if (!preparedInputs.usedRemoteFirst || didRetryWithStableInputs || generatedOutputs.length > 0) return false;
        didRetryWithStableInputs = true;
        console.warn('公网参考图生成失败，尝试切换本地缓存参考图:', cause);
        setCanvasAiOutputs(currentOutputs.map(output => output.status === 'success'
          ? output
          : { ...output, error: 'Switching to local reference images' }
        ), { status: 'working', error: undefined });
        try {
          const fallbackInputs = await getCanvasImageInputsForNode(
            target,
            'stable',
            useDirectReferenceImages ? 'direct' : 'auto',
            getSourceItems()
          );
          inputImages = fallbackInputs.images;
          temporaryCloudflaredShareIds = [
            ...temporaryCloudflaredShareIds,
            ...fallbackInputs.temporaryShareIds,
          ];
          generateOptions = {
            ...generateOptions,
            inputImages,
          };
          return fallbackInputs.images.length > 0;
        } catch (fallbackError) {
          throw new Error(`公网参考图失败：${getCanvasAiErrorSummary(cause instanceof Error ? cause.message : String(cause))}；本地兜底也失败：${getCanvasAiErrorSummary(fallbackError instanceof Error ? fallbackError.message : String(fallbackError))}`);
        }
      };

      const retryWithFreshRemoteInputs = async (cause: unknown) => {
        if (!isXaisWorkerRequest || generatedOutputs.length > 0 || xaisReferenceRetryCount >= 3) return false;
        const message = cause instanceof Error ? cause.message : String(cause || '');
        if (!/(?:Failed to download media|DownloadFailed|Bad Gateway|fetch-object|CreateAsset|InvalidParameter\.Name|Name must be no more|trycloudflare|cloudflared|Cloudflare Tunnel)/i.test(message)) {
          return false;
        }
        xaisReferenceRetryCount += 1;
        console.warn(`Xais 参考素材抓取失败，重新发布参考素材后重试 ${xaisReferenceRetryCount}/3:`, cause);
        setCanvasAiOutputs(currentOutputs.map(output => output.status === 'success'
          ? output
          : { ...output, status: 'working' as const, error: `重新发布参考素材 ${xaisReferenceRetryCount}/3` }
        ), { status: 'working', error: undefined });
        try {
          const freshInputs = await getCanvasImageInputsForNode(
            target,
            inputMode,
            'remote-only',
            getSourceItems()
          );
          if (freshInputs.images.length === 0) return false;
          inputImages = freshInputs.images;
          temporaryCloudflaredShareIds = [
            ...temporaryCloudflaredShareIds,
            ...freshInputs.temporaryShareIds,
          ];
          generateOptions = {
            ...generateOptions,
            inputImages,
          };
          await new Promise<void>(resolve => window.setTimeout(resolve, 3200));
          return true;
        } catch (freshError) {
          throw new Error(`参考素材重新发布失败：${getCanvasAiErrorSummary(freshError instanceof Error ? freshError.message : String(freshError))}`);
        }
      };

      const placeGeneratedMedia = async (url: string, index: number) => {
        const cached = await cacheCanvasGeneratedImageSource(
          url,
          mediaType === 'video'
            ? `AI generated video ${Date.now()}-${index + 1}.mp4`
            : `AI generated ${Date.now()}-${index + 1}`
        );
        const displayUrl = cached.url || url;
        const size = mediaType === 'video'
          ? getCanvasAiOutputSize(target.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO)
          : await readImageDisplaySize(displayUrl);
        const generatedAt = Date.now();
        const output: CanvasAiGeneratedOutput = {
          ...(currentOutputs[index] || {
            id: `canvas_ai_output_${generatedAt.toString(36)}_${index}`,
            prompt,
          }),
          mediaType,
          url: displayUrl,
          path: cached.path || undefined,
          name: mediaType === 'video' ? `AI generated video #${index + 1}` : `AI generated #${index + 1}`,
          prompt,
          status: 'success',
          error: undefined,
          generatedAt,
          width: size.width,
          height: size.height,
        };
        const nextOutputs = currentOutputs.map((item, itemIndex) => itemIndex === index ? output : item);
        setCanvasAiOutputs(nextOutputs, { status: 'working', error: undefined, generatedAt });
        generatedOutputs.push(output);
        if (!drawerUndoPushed) {
          pushDrawerUndoSnapshot(mediaType === 'video' ? '保存 AI 视频' : '保存 AI 生图');
          drawerUndoPushed = true;
        }
        const latestTarget = options.getLatestTarget?.() || {
          ...target,
          ai: {
            ...(target.ai || { type: mediaType === 'video' ? 'video-generator' as const : 'image-generator' as const }),
            outputs: nextOutputs,
            generatedAt,
          },
        } as CanvasImageItem;
        const drawerItem = createCanvasAiOutputBufferItem(latestTarget, output, index);
        if (drawerItem) {
          if (mediaType === 'video') addGeneratedVideosToDrawer([drawerItem]);
          else addGeneratedImagesToDrawer([drawerItem]);
        }
        return output;
      };

      while (generatedOutputs.length < requestedCount) {
        const index = generatedOutputs.length;
        setCanvasAiOutputs(currentOutputs.map((output, outputIndex) => outputIndex === index
          ? { ...output, status: 'working' as const, error: undefined }
          : output
        ), { status: 'working', error: undefined });

        try {
          const batch = mediaType === 'video'
            ? await generateCanvasAiProviderVideos(generateOptions)
            : await generateCanvasAiProviderImages(generateOptions);
          const freshUrls = batch
            .map(url => url.trim())
            .filter(url => url && !seenGeneratedUrls.has(url));
          if (freshUrls.length === 0) {
            throw new Error(mediaType === 'video' ? '接口没有返回新的视频数据' : '接口没有返回新的图片数据');
          }
          for (const url of freshUrls) {
            if (generatedOutputs.length >= requestedCount) break;
            seenGeneratedUrls.add(url);
            await placeGeneratedMedia(url, generatedOutputs.length);
          }
        } catch (error) {
          lastPartialError = error;
          if (await retryWithFreshRemoteInputs(error)) {
            continue;
          }
          if (await retryWithStableInputs(error)) {
            continue;
          }
          if (generatedOutputs.length === 0) throw error;
          break;
        }
      }

      if (generatedOutputs.length === 0) {
        throw new Error(mediaType === 'video' ? '接口没有返回可用视频' : '接口没有返回可用图片');
      }
      const finishedAt = Date.now();
      const unit = mediaType === 'video' ? '条视频' : '张图片';
      if (generatedOutputs.length < requestedCount) {
        const partialError = lastPartialError
          ? `已生成 ${generatedOutputs.length}/${requestedCount} ${unit}，后续失败：${getCanvasAiErrorSummary(lastPartialError instanceof Error ? lastPartialError.message : String(lastPartialError))}`
          : `接口只返回了 ${generatedOutputs.length}/${requestedCount} ${unit}`;
        setCanvasAiOutputs(currentOutputs.map(output => output.status === 'success'
          ? output
          : { ...output, status: 'error' as const, error: partialError, generatedAt: output.generatedAt || finishedAt }
        ), { status: 'error', error: `已生成 ${generatedOutputs.length}/${requestedCount} ${unit}`, generatedAt: finishedAt });
      } else {
        setCanvasAiOutputs(currentOutputs, { status: 'success', error: undefined, generatedAt: finishedAt });
      }
      options.selectTarget?.();
      if (options.showResultToast !== false) {
        const label = options.toastLabel || 'AI 节点';
        showToast(generatedOutputs.length >= requestedCount
          ? `${label}生成 ${generatedOutputs.length} ${unit}，已放入「${mediaType === 'video' ? AI_GENERATED_VIDEO_FOLDER_NAME : AI_GENERATED_FOLDER_NAME}」`
          : `${label}生成 ${generatedOutputs.length}/${requestedCount} ${unit}`);
      }
      return generatedOutputs;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorSummary = getCanvasAiErrorSummary(message);
      console.warn('AI 节点生成失败:', err);
      const failedAt = Date.now();
      const failedOutputs = (currentOutputs.length > 0 ? currentOutputs : outputDrafts).map(output => output.status === 'success'
        ? output
        : { ...output, status: 'error' as const, error: errorSummary, generatedAt: output.generatedAt || failedAt }
      );
      forceCanvasAiOutputs(failedOutputs, { status: 'error', error: errorSummary, generatedAt: failedAt });
      if (options.forceUpdateAi) {
        window.setTimeout(() => {
          forceCanvasAiOutputs(failedOutputs, { status: 'error', error: errorSummary, generatedAt: failedAt });
        }, 0);
      }
      if (options.showResultToast !== false) {
        showToast(`${options.toastLabel || 'AI 节点'}生成失败：${errorSummary.slice(0, 80)}`);
      }
      return [] as CanvasAiGeneratedOutput[];
    } finally {
      if (temporaryCloudflaredShareIds.length > 0) {
        if (mediaType === 'video') {
          window.setTimeout(() => {
            void stopTemporaryCloudflaredShares(temporaryCloudflaredShareIds);
          }, CANVAS_AI_VIDEO_REFERENCE_SHARE_KEEPALIVE_MS);
        } else {
          void stopTemporaryCloudflaredShares(temporaryCloudflaredShareIds);
        }
      }
    }
  };

  const runCanvasAiGeneratorNode = async (targetId: string) => {
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;
    const runToken = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    canvasAiRunTokensRef.current[targetId] = runToken;
    const isCurrentRun = () => canvasAiRunTokensRef.current[targetId] === runToken;
    const updateAiIfCurrent = (patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => {
      if (!isCurrentRun()) return;
      updateCanvasAiGeneratorData(targetId, patch, content);
    };
    try {
      await runCanvasAiGeneratorTarget(target, {
        updateAi: updateAiIfCurrent,
        forceUpdateAi: updateAiIfCurrent,
        getLatestTarget: () => canvasItemsRef.current.find(item => item.id === targetId),
        selectTarget: () => {
          if (isCurrentRun()) updateCanvasSelection([targetId]);
        },
        showResultToast: true,
        toastLabel: getCanvasAiNodeTitle(target.ai),
      });
    } finally {
      window.setTimeout(() => {
        if (isCurrentRun()) delete canvasAiRunTokensRef.current[targetId];
      }, 250);
    }
  };

  const generateCanvasAiGeneratorNode = async (targetId: string) => {
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;
    if (getCanvasWorkflowGroup(target) && target.ai?.type === 'image-generator') {
      await runCanvasExpandedWorkflowFromNode(targetId);
      return;
    }
    if (!hasCanvasAiGeneratedResults(target)) {
      await runCanvasAiGeneratorNode(targetId);
      return;
    }

    const nextNode = cloneCanvasAiGeneratorForRerun(target);
    if (!nextNode) return;
    if (appendCanvasItems([nextNode], '再次生成 AI 节点') <= 0) return;
    showToast('已复制节点，开始再次生成');
    await runCanvasAiGeneratorNode(nextNode.id);
  };

  const sortCanvasWorkflowRuntimeNodeIds = (sourceItems: CanvasImageItem[]) => {
    const itemsById = new Map(sourceItems.map(item => [item.id, item]));
    const aiIds = sourceItems.filter(item => item.ai?.type === 'image-generator').map(item => item.id);
    const nodeSet = new Set(aiIds);
    const indegree = new Map(aiIds.map(id => [id, 0]));
    const children = new Map<string, string[]>();

    aiIds.forEach(targetId => {
      const target = itemsById.get(targetId);
      (target?.inputs || []).forEach(inputId => {
        const source = itemsById.get(inputId);
        if (!source || source.ai?.type !== 'image-generator' || !nodeSet.has(inputId)) return;
        indegree.set(targetId, (indegree.get(targetId) || 0) + 1);
        children.set(inputId, [...(children.get(inputId) || []), targetId]);
      });
    });

    const byCanvasPosition = (a: string, b: string) => {
      const itemA = itemsById.get(a);
      const itemB = itemsById.get(b);
      return (itemA?.x || 0) - (itemB?.x || 0) || (itemA?.y || 0) - (itemB?.y || 0);
    };
    const queue = aiIds.filter(id => (indegree.get(id) || 0) === 0).sort(byCanvasPosition);
    const order: string[] = [];

    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) break;
      order.push(id);
      (children.get(id) || []).forEach(childId => {
        const nextDegree = (indegree.get(childId) || 0) - 1;
        indegree.set(childId, nextDegree);
        if (nextDegree === 0) {
          queue.push(childId);
          queue.sort(byCanvasPosition);
        }
      });
    }

    if (order.length < aiIds.length) {
      const ordered = new Set(order);
      order.push(...aiIds.filter(id => !ordered.has(id)).sort(byCanvasPosition));
    }
    return order;
  };

  const getCanvasExpandedWorkflowDownstreamGeneratorIds = (
    sourceId: string,
    groupItems: CanvasImageItem[]
  ) => {
    const groupIds = new Set(groupItems.map(item => item.id));
    const children = new Map<string, string[]>();
    groupItems.forEach(item => {
      (item.inputs || []).forEach(inputId => {
        if (!groupIds.has(inputId)) return;
        children.set(inputId, [...(children.get(inputId) || []), item.id]);
      });
    });

    const reachable = new Set<string>([sourceId]);
    const queue = [sourceId];
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) break;
      (children.get(currentId) || []).forEach(childId => {
        if (reachable.has(childId)) return;
        reachable.add(childId);
        queue.push(childId);
      });
    }

    const order = sortCanvasWorkflowRuntimeNodeIds(groupItems);
    const orderedReachable = order.filter(id => reachable.has(id));
    return orderedReachable.includes(sourceId)
      ? orderedReachable
      : [sourceId, ...orderedReachable];
  };

  const runCanvasExpandedWorkflowFromNode = async (targetId: string) => {
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    const group = getCanvasWorkflowGroup(target);
    if (!target || target.ai?.type !== 'image-generator' || !group) return false;

    const groupItems = getCanvasWorkflowExpandedGroupItems(group.groupId);
    const runIds = getCanvasExpandedWorkflowDownstreamGeneratorIds(targetId, groupItems);
    if (runIds.length === 0) {
      showToast('这个展开工作流里没有可运行的后续生图节点');
      return true;
    }

    const runIdSet = new Set(runIds);
    const groupSelectionIds = getCanvasWorkflowGroupItemIdsForSelection(group.groupId);
    pushCanvasUndoSnapshot('重新生成工作流内部节点');
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (!runIdSet.has(item.id) || item.ai?.type !== 'image-generator') return item;
      return {
        ...item,
        ai: {
          ...item.ai,
          type: 'image-generator' as const,
          status: item.id === targetId ? 'working' as const : 'idle' as const,
          error: undefined,
          generatedAt: undefined,
          outputs: [],
        },
      };
    }));
    updateCanvasSelection(groupSelectionIds.length > 0 ? groupSelectionIds : [targetId]);
    showToast(`开始从「${target.ai.presetLabel || target.item.name || '内部节点'}」重新生成，并更新 ${runIds.length - 1} 个后续节点`);

    const failedIds = new Set<string>();
    let successCount = 0;
    for (const nodeId of runIds) {
      const current = canvasItemsRef.current.find(item => item.id === nodeId);
      if (!current || current.ai?.type !== 'image-generator') continue;

      const upstreamAiIds = (current.inputs || []).filter(inputId => {
        const source = canvasItemsRef.current.find(item => item.id === inputId);
        return !!source && runIdSet.has(inputId) && source.ai?.type === 'image-generator';
      });
      if (upstreamAiIds.some(inputId => failedIds.has(inputId))) {
        failedIds.add(nodeId);
        updateCanvasAiGeneratorData(nodeId, {
          status: 'error',
          error: '上游节点生成失败，已跳过',
          outputs: [],
          generatedAt: Date.now(),
        });
        continue;
      }

      await runCanvasAiGeneratorTarget(current, {
        sourceItems: () => canvasItemsRef.current,
        updateAi: (patch, content) => updateCanvasAiGeneratorData(nodeId, patch, content),
        getLatestTarget: () => canvasItemsRef.current.find(item => item.id === nodeId),
        showResultToast: false,
      });

      const latest = canvasItemsRef.current.find(item => item.id === nodeId);
      if (getCanvasAiSuccessfulOutputs(latest).length > 0) {
        successCount += 1;
      } else {
        failedIds.add(nodeId);
      }
    }

    showToast(failedIds.size > 0
      ? `展开工作流已部分更新：成功 ${successCount} 个，失败/跳过 ${failedIds.size} 个`
      : `展开工作流已更新 ${successCount} 个节点`);
    return true;
  };

  const cloneCanvasWorkflowModuleForRerun = (source: CanvasImageItem): CanvasImageItem | null => {
    const workflow = getCanvasWorkflowTemplateFromNode(source);
    if (!workflow) return null;
    const pos = getCanvasAiRerunNodePosition(source);
    const nextNode = buildCanvasWorkflowModuleNode(workflow, pos, source.inputs || []);
    if (!nextNode) return null;
    return {
      ...nextNode,
      item: {
        ...nextNode.item,
        name: source.item.name || nextNode.item.name,
        remark: source.item.remark || nextNode.item.remark,
      },
    };
  };

  const runCanvasWorkflowModuleNode = async (targetId: string) => {
    const moduleNode = canvasItemsRef.current.find(item => item.id === targetId);
    const workflow = getCanvasWorkflowTemplateFromNode(moduleNode);
    if (!moduleNode || !workflow) {
      showToast('请先选中一个工作流模块');
      return;
    }

    const runtime = instantiateCanvasWorkflowTemplateItems(workflow, { x: moduleNode.x, y: moduleNode.y }, moduleNode.inputs || []);
    let runtimeItems = runtime.items;
    const runOrder = sortCanvasWorkflowRuntimeNodeIds(runtimeItems);
    if (runOrder.length === 0) {
      updateCanvasAiGeneratorData(targetId, { status: 'error', error: '工作流内部没有生图节点' });
      showToast('工作流内部没有生图节点');
      return;
    }

    const outputDrafts = createCanvasWorkflowOutputDrafts(moduleNode, workflow, 'working');
    const outputSlots = getCanvasWorkflowOutputSlotTemplates(workflow)
      .map(slot => ({
        ...slot,
        runtimeId: runtime.idMap.get(slot.node.id),
      }))
      .filter((slot): slot is { node: CanvasWorkflowNodeTemplate; index: number; runtimeId: string } => !!slot.runtimeId);
    const runSet = new Set(runOrder);
    const failedIds = new Set<string>();
    let completedCount = 0;

    const getRuntimeSourceItems = () => [
      ...canvasItemsRef.current.filter(item => item.id !== targetId),
      ...runtimeItems,
    ];
    const collectModuleOutputs = (
      fallbackStatus?: CanvasAiGeneratedOutput['status'],
      fallbackError?: string
    ) => outputDrafts.map((draft, slotIndex) => {
      const slot = outputSlots[slotIndex];
      if (!slot) return fallbackStatus ? { ...draft, status: fallbackStatus, error: fallbackError } : draft;
      const runtimeItem = runtimeItems.find(item => item.id === slot.runtimeId);
      const output = getCanvasAiSuccessfulOutputs(runtimeItem)[slot.index];
      if (!output) {
        return fallbackStatus
          ? { ...draft, status: fallbackStatus, error: fallbackError, generatedAt: draft.generatedAt || Date.now() }
          : draft;
      }
      return {
        ...draft,
        ...output,
        id: draft.id,
        name: draft.name,
      };
    });
    const getRuntimeSnapshots = () => createCanvasWorkflowRuntimeSnapshots(workflow, runtimeItems, runtime.idMap);

    updateCanvasAiGeneratorData(targetId, {
      status: 'working',
      error: undefined,
      outputs: outputDrafts,
      generatedAt: Date.now(),
    });
    updateCanvasSelection([targetId]);
    showToast(`开始运行工作流「${workflow.label}」：${runOrder.length} 个内部生图节点`);

    for (const nodeId of runOrder) {
      const current = runtimeItems.find(item => item.id === nodeId);
      if (!current || current.ai?.type !== 'image-generator') continue;
      const upstreamAiIds = (current.inputs || []).filter(inputId => {
        const source = runtimeItems.find(item => item.id === inputId);
        return source?.ai?.type === 'image-generator' && runSet.has(inputId);
      });
      if (upstreamAiIds.some(inputId => failedIds.has(inputId))) {
        failedIds.add(nodeId);
        continue;
      }
      if (getCanvasAiSuccessfulOutputs(current).length > 0) {
        completedCount += 1;
        continue;
      }
      await runCanvasAiGeneratorTarget(current, {
        sourceItems: getRuntimeSourceItems,
        updateAi: (patch, content) => {
          runtimeItems = runtimeItems.map(item => {
            if (item.id !== nodeId) return item;
            return {
              ...item,
              ai: {
                ...(item.ai || {}),
                ...patch,
                type: patch.type || item.ai?.type || 'image-generator',
              },
              item: content === undefined ? item.item : {
                ...item.item,
                content,
                name: content.trim().split(/\r?\n/)[0]?.slice(0, 24) || item.item.name,
              },
            };
          });
        },
        getLatestTarget: () => runtimeItems.find(item => item.id === nodeId),
        showResultToast: false,
      });
      const latest = runtimeItems.find(item => item.id === nodeId);
      if (getCanvasAiSuccessfulOutputs(latest).length > 0) {
        completedCount += 1;
        updateCanvasAiGeneratorData(targetId, {
          outputs: collectModuleOutputs('working'),
          workflowRuntime: getRuntimeSnapshots(),
          status: 'working',
          error: undefined,
          generatedAt: Date.now(),
        });
      } else {
        failedIds.add(nodeId);
      }
    }

    const finalOutputs = collectModuleOutputs('error', failedIds.size > 0 ? '内部节点生成失败' : '没有生成这个输出');
    const finalSuccessCount = finalOutputs.filter(output => output.status === 'success' && getCanvasAiOutputDisplaySource(output)).length;
    if (failedIds.size > 0 || finalSuccessCount < outputSlots.length) {
      updateCanvasAiGeneratorData(targetId, {
        outputs: finalOutputs,
        workflowRuntime: getRuntimeSnapshots(),
        status: 'error',
        error: failedIds.size > 0 ? `内部 ${failedIds.size} 个节点失败或被中断` : '部分终端输出没有生成',
        generatedAt: Date.now(),
      });
      showToast(failedIds.size > 0
        ? `工作流「${workflow.label}」部分完成：成功 ${completedCount} 个，失败/中断 ${failedIds.size} 个`
        : `工作流「${workflow.label}」部分输出缺失`);
      return;
    }
    updateCanvasAiGeneratorData(targetId, {
      outputs: finalOutputs,
      workflowRuntime: getRuntimeSnapshots(),
      status: 'success',
      error: undefined,
      generatedAt: Date.now(),
    });
    showToast(`工作流「${workflow.label}」完成：生成 ${finalOutputs.filter(output => getCanvasAiOutputDisplaySource(output)).length} 张结果`);
  };

  const generateCanvasWorkflowModuleNode = async (targetId: string) => {
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || target.ai?.type !== 'workflow') return;
    if (!hasCanvasAiGeneratedResults(target)) {
      await runCanvasWorkflowModuleNode(targetId);
      return;
    }
    const nextNode = cloneCanvasWorkflowModuleForRerun(target);
    if (!nextNode) return;
    if (appendCanvasItems([nextNode], '再次运行工作流') <= 0) return;
    showToast('已复制工作流模块，开始再次运行');
    await runCanvasWorkflowModuleNode(nextNode.id);
  };

  const runSelectedCanvasWorkflowModules = async (seedIds = canvasSelectedIdsRef.current) => {
    const workflowIds = seedIds.filter(id => canvasItemsRef.current.find(item => item.id === id)?.ai?.type === 'workflow');
    if (workflowIds.length === 0) {
      showToast('先选中一个工作流模块');
      return;
    }
    for (const workflowId of workflowIds) {
      await generateCanvasWorkflowModuleNode(workflowId);
    }
  };

  const addCanvasDroppedFiles = async (files: FileList | File[], client?: { x: number; y: number }) => {
    const allFiles = Array.from(files || []);
    const imageFiles = allFiles.filter(file => file.type.startsWith('image/') || isCanvasImageFileName(file.name));
    const videoFiles = allFiles.filter(file => file.type.startsWith('video/') || isCanvasVideoFileName(file.name));
    if (imageFiles.length === 0 && videoFiles.length === 0) return false;

    lastCanvasDroppedPathsKeyRef.current = [...imageFiles, ...videoFiles].map(file => `${file.name}:${file.size}:${file.lastModified}`).join('\n');
    lastCanvasDropAtRef.current = Date.now();

    const createdImages = await Promise.all(imageFiles.map((file, index) => createCanvasImageItemFromFile(file, index, client)));
    const imageItems = createdImages.filter((item): item is CanvasImageItem => !!item);
    const videoPaths = videoFiles
      .map(file => (file as File & { path?: string }).path || '')
      .filter(Boolean);
    const createdVideos = await Promise.all(videoPaths.map((path, index) => createCanvasVideoItemFromPath(path, imageItems.length + index, client)));
    const videoItems = createdVideos.filter((item): item is CanvasImageItem => !!item);
    const nextItems = [...imageItems, ...videoItems];
    addCanvasImageItems(nextItems);
    return nextItems.length > 0;
  };

  const addCanvasDroppedPaths = async (paths: string[], client?: { x: number; y: number }) => {
    const cleanPaths = Array.from(new Set((paths || []).map(normalizeLocalDragPath).filter(Boolean)));
    if (cleanPaths.length === 0) return;

    const key = cleanPaths.join('\n');
    const now = Date.now();
    if (key === lastCanvasDroppedPathsKeyRef.current && now - lastCanvasDropAtRef.current < 700) return;
    lastCanvasDroppedPathsKeyRef.current = key;
    lastCanvasDropAtRef.current = now;

    const created = await Promise.all(cleanPaths.map((path, index) => (
      isCanvasVideoFileName(path)
        ? createCanvasVideoItemFromPath(path, index, client)
        : createCanvasImageItemFromPath(path, index, client)
    )));
    const mediaItems = created.filter((item): item is CanvasImageItem => !!item);
    addCanvasImageItems(mediaItems);
    if (mediaItems.length === 0) showToast('无限画布只接收图片或视频');
  };

  const addDrawerImageItemToCanvas = async (itemId: string, client?: { x: number; y: number }) => {
    const source = items.find(item => item.id === itemId);
    if (!source || source.type !== 'image') return false;

    const item: BufferItem = {
      ...source,
      id: Math.random().toString(36).substring(2, 9),
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const pos = getCanvasDropPosition(0, client);
    const canvasId = `canvas_${item.id}`;
    const size = await readImageDisplaySize(item.url || (item.path ? convertFileSrc(item.path) : ''));
    const canvasItem = {
      id: canvasId,
      item,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    };
    if (appendCanvasItems([canvasItem], '添加图片到画布') === 0) return false;
    showToast('已添加到无限画布');
    return true;
  };

  const getFolderImageItemsForCanvas = (folderId?: string) => (
    items.filter(item => item.type === 'image' && (folderId ? item.folderId === folderId : !item.folderId))
  );

  const requestAddFolderImagesToCanvas = (folderId?: string, folderName = '主抽屉', anchor?: { x: number; y: number }) => {
    const count = getFolderImageItemsForCanvas(folderId).length;
    if (count === 0) {
      showToast('这个文件夹里还没有图片');
      return;
    }
    setCanvasFolderImportPrompt({
      folderId,
      folderName,
      count,
      x: anchor?.x ?? 72,
      y: anchor?.y ?? 96,
    });
  };

  const addFolderImagesToCanvas = async (folderId?: string) => {
    const imageItems = getFolderImageItemsForCanvas(folderId);
    if (imageItems.length === 0) {
      showToast('这个文件夹里还没有图片');
      return;
    }

    const now = Date.now();
    const nextItems = await Promise.all(imageItems.map(async (source, index) => {
      const item: BufferItem = {
        ...source,
        id: Math.random().toString(36).substring(2, 9),
        createdAt: now + index,
        isQuickAccess: false,
      };
      const pos = getCanvasDropPosition(index);
      const size = await readImageDisplaySize(item.url || (item.path ? convertFileSrc(item.path) : ''));
      return {
        id: `canvas_${item.id}`,
        item,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
      } as CanvasImageItem;
    }));

    const addedCount = appendCanvasItems(nextItems, '添加图片到画布');
    if (addedCount > 0) showToast(`已添加 ${addedCount} 张图片到无限画布`);
  };

  const confirmAddFolderImagesToCanvas = () => {
    const prompt = canvasFolderImportPrompt;
    if (!prompt) return;
    setCanvasFolderImportPrompt(null);
    void addFolderImagesToCanvas(prompt.folderId);
  };

  const addFolderImagePickerItemToCanvas = (itemId: string) => {
    setCanvasFolderImportPrompt(null);
    void addDrawerImageItemToCanvas(itemId);
  };

  const addCanvasWebImageUrl = async (url: string, name?: string, client?: { x: number; y: number }) => {
    const normalizedUrl = normalizeDraggedUrl(url);
    if (!normalizedUrl) return;
    const now = Date.now();
    if (normalizedUrl === lastWebImageUrlRef.current && now - lastWebImageDropAtRef.current < 900) return;
    lastWebImageUrlRef.current = normalizedUrl;
    lastWebImageDropAtRef.current = now;

    const itemId = Math.random().toString(36).substring(2, 9);
    const displayName = name || getNameFromUrl(normalizedUrl);
    const item: BufferItem = {
      id: itemId,
      type: 'image',
      content: displayName,
      name: displayName,
      url: normalizedUrl,
      path: normalizedUrl,
      sourceUrl: normalizedUrl,
      originalUrl: normalizedUrl,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const pos = getCanvasDropPosition(0, client);
    const canvasId = `canvas_${itemId}`;
    const size = await readImageDisplaySize(normalizedUrl);
    const canvasItem = {
      id: canvasId,
      item,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    };
    if (appendCanvasItems([canvasItem], '添加图片到画布', false) === 0) return;
    showToast('已添加网页图片到无限画布，正在缓存');

    const latestCacheDir = (
      webImageCacheDirRef.current ||
      localStorage.getItem('drawer_web_image_cache_dir') ||
      ''
    ).trim();

    invoke<string>('cache_web_image', {
      url: normalizedUrl,
      name: displayName,
      dir: latestCacheDir || undefined,
    }).then((cachedPath) => {
      if (!cachedPath) return;
      const cachedUrl = convertFileSrc(cachedPath);
      updateCanvasItemsImmediate(prev => prev.map(canvasItem => canvasItem.id === canvasId
        ? {
            ...canvasItem,
            item: {
              ...canvasItem.item,
              url: cachedUrl,
              path: cachedPath,
              sourceUrl: normalizedUrl,
              originalUrl: normalizedUrl,
            },
          }
        : canvasItem));
    }).catch((err) => {
      console.warn('画布网页图片缓存失败:', err);
      showToast('网页图片已加入画布，缓存失败');
    });
  };

  const enterCanvasMode = () => {
    const hasCanvasContent = canvasItemsRef.current.length > 0;
    const primaryImageId = getCanvasPrimaryImageItem()?.id || canvasItemsRef.current[0]?.id || null;
    isCanvasModeRef.current = true;
    setIsCanvasMode(true);
    setShowCanvasExitPrompt(false);
    setCanvasExitPromptStep('choice');
    setActiveFolderId('all');
    setActiveTab('all');
    setShowSettings(false);
    setIsSearchActive(false);
    setShowTextInput(false);
    setIsSelectMode(false);
    setSelectedIds([]);
    setIsOpen(true);
    setIsPinned(false);
    isPinnedRef.current = false;
    setDrawerState('open');
    invoke('toggle_pin', { pinned: false }).catch(()=>{});
    showToast('已进入无限画布模式');
    window.requestAnimationFrame(() => {
      const surface = canvasSurfaceRef.current;
      const scroll = canvasReturnScrollRef.current;
      if (hasCanvasContent) {
        scheduleCanvasFocusItemById(primaryImageId);
      } else if (surface && scroll) {
        writeCanvasSurfaceScroll(surface, scroll.left, scroll.top);
      }
      canvasSurfaceRef.current?.focus({ preventScroll: true });
    });
  };

  const clearMainDrawerLongPress = () => {
    if (mainDrawerLongPressTimerRef.current !== null) {
      window.clearTimeout(mainDrawerLongPressTimerRef.current);
      mainDrawerLongPressTimerRef.current = null;
    }
  };

  const startMainDrawerLongPress = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    mainDrawerLongPressTriggeredRef.current = false;
    clearMainDrawerLongPress();
    mainDrawerLongPressTimerRef.current = window.setTimeout(() => {
      mainDrawerLongPressTriggeredRef.current = true;
      if (isCanvasModeRef.current) requestExitCanvasMode();
      else enterCanvasMode();
    }, 620);
  };

  const finishMainDrawerPress = () => {
    clearMainDrawerLongPress();
    window.setTimeout(() => {
      mainDrawerLongPressTriggeredRef.current = false;
    }, 0);
  };

  const startCanvasItemDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    if (isCanvasSpacePressedRef.current || canvasResizeRef.current) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-no-drag="true"], textarea, input, button, select, [contenteditable="true"]')) return;
    const current = canvasItemsRef.current.find(item => item.id === id);
    if (!current) return;
    const inputPickTargetId = canvasInputPickTargetIdRef.current;
    if (inputPickTargetId) {
      e.preventDefault();
      e.stopPropagation();
      pickCanvasImageForGenerator(id, inputPickTargetId);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setCanvasInteractionActive(true);
    const currentSelected = canvasSelectedIdsRef.current;
    const isAdditive = e.shiftKey || e.ctrlKey || e.metaKey;
    const itemSelectionIds = getCanvasWorkflowSelectionIdsForItem(id);
    const isItemSelectionSelected = itemSelectionIds.every(selectionId => currentSelected.includes(selectionId));
    let nextSelected = isItemSelectionSelected ? currentSelected : itemSelectionIds;
    if (isAdditive) {
      const itemSelectionSet = new Set(itemSelectionIds);
      nextSelected = isItemSelectionSelected
        ? currentSelected.filter(selectedId => !itemSelectionSet.has(selectedId))
        : [...currentSelected, ...itemSelectionIds];
      if (nextSelected.length === 0) nextSelected = itemSelectionIds;
    }
    nextSelected = expandCanvasSelectionIdsWithWorkflowGroups(nextSelected);
    updateCanvasSelection(nextSelected);
    const dragIds = nextSelected.includes(id) ? nextSelected : [id];
    canvasDragRef.current = {
      ids: dragIds,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startScrollLeft: canvasSurfaceRef.current?.scrollLeft ?? 0,
      startScrollTop: canvasSurfaceRef.current?.scrollTop ?? 0,
      startItems: makeCanvasItemBoxMap(dragIds),
      hasMoved: false,
    };

    const onMove = (event: PointerEvent) => {
      const drag = canvasDragRef.current;
      if (!drag || !drag.ids.includes(id)) return;
      event.preventDefault();
      event.stopPropagation();
      autoScrollCanvasNearEdge(event);
      const scale = canvasScaleRef.current || 1;
      const surface = canvasSurfaceRef.current;
      const scrollDx = surface ? (surface.scrollLeft - drag.startScrollLeft) / scale : 0;
      const scrollDy = surface ? (surface.scrollTop - drag.startScrollTop) / scale : 0;
      const dx = (event.clientX - drag.startClientX) / scale + scrollDx;
      const dy = (event.clientY - drag.startClientY) / scale + scrollDy;
      if (!drag.hasMoved && Math.hypot(dx, dy) > 1.5) {
        pushCanvasUndoSnapshot('移动画布元素');
        drag.hasMoved = true;
      }
      const nextById = drag.ids.reduce<Record<string, CanvasItemBox>>((acc, dragId) => {
        const start = drag.startItems[dragId];
        if (!start) return acc;
        acc[dragId] = {
          ...start,
          x: Math.max(0, start.x + dx),
          y: Math.max(0, start.y + dy),
        };
        return acc;
      }, {});
      const moved = Object.values(nextById);
      if (moved.length > 0) {
        growCanvasToFit(
          Math.max(...moved.map(item => item.x + item.width)),
          Math.max(...moved.map(item => item.y + item.height))
        );
      }
      updateCanvasItemsInFrame(prev => prev.map(item => {
        const next = nextById[item.id];
        return next ? { ...item, x: next.x, y: next.y } : item;
      }));
    };
    const onUp = () => {
      flushCanvasItemsInFrame();
      canvasDragRef.current = null;
      setCanvasInteractionActive(false);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  };

  const startCanvasItemResize = (e: React.PointerEvent, id: string, corner: CanvasResizeCorner) => {
    if (e.button !== 0) return;
    const current = canvasItemsRef.current.find(item => item.id === id);
    if (!current) return;
    e.preventDefault();
    e.stopPropagation();
    setCanvasInteractionActive(true);
    if (!canvasSelectedIdsRef.current.includes(id)) updateCanvasSelection([id]);

    canvasResizeRef.current = {
      id,
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: current.x,
      startY: current.y,
      startWidth: current.width,
      startHeight: current.height,
      aspect: current.width / Math.max(1, current.height),
      hasResized: false,
    };

    const onMove = (event: PointerEvent) => {
      const resize = canvasResizeRef.current;
      if (!resize || resize.id !== id) return;
      event.preventDefault();
      event.stopPropagation();
      const scale = canvasScaleRef.current || 1;
      const dx = (event.clientX - resize.startClientX) / scale;
      const dy = (event.clientY - resize.startClientY) / scale;
      if (!resize.hasResized && Math.hypot(dx, dy) > 1.5) {
        pushCanvasUndoSnapshot('缩放画布元素');
        resize.hasResized = true;
      }
      const isWest = resize.corner.includes('w');
      const isNorth = resize.corner.includes('n');
      const rawWidth = isWest ? resize.startWidth - dx : resize.startWidth + dx;
      const rawHeight = isNorth ? resize.startHeight - dy : resize.startHeight + dy;
      const nextWidth = clamp(Math.max(rawWidth, rawHeight * resize.aspect), CANVAS_MIN_IMAGE_WIDTH, CANVAS_MAX_IMAGE_WIDTH);
      const nextHeight = nextWidth / resize.aspect;
      const nextX = isWest ? resize.startX + resize.startWidth - nextWidth : resize.startX;
      const nextY = isNorth ? resize.startY + resize.startHeight - nextHeight : resize.startY;
      const finalX = Math.max(0, nextX);
      const finalY = Math.max(0, nextY);

      growCanvasToFit(finalX + nextWidth, finalY + nextHeight);
      updateCanvasItemsInFrame(prev => prev.map(item => item.id === id ? {
        ...item,
        x: finalX,
        y: finalY,
        width: nextWidth,
        height: nextHeight,
      } : item));
    };
    const onUp = () => {
      flushCanvasItemsInFrame();
      canvasResizeRef.current = null;
      setCanvasInteractionActive(false);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  };

  const startCanvasGroupResize = (e: React.PointerEvent, corner: CanvasResizeCorner) => {
    if (e.button !== 0) return;
    const selectedIds = canvasSelectedIdsRef.current;
    if (selectedIds.length < 2) return;
    const startBounds = getCanvasItemsBounds(selectedIds);
    if (!startBounds || startBounds.width <= 0 || startBounds.height <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    setCanvasInteractionActive(true);

    canvasGroupResizeRef.current = {
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBounds,
      startItems: makeCanvasItemBoxMap(selectedIds),
      aspect: startBounds.width / Math.max(1, startBounds.height),
      hasResized: false,
    };

    const onMove = (event: PointerEvent) => {
      const resize = canvasGroupResizeRef.current;
      if (!resize) return;
      event.preventDefault();
      event.stopPropagation();
      const scale = canvasScaleRef.current || 1;
      const dx = (event.clientX - resize.startClientX) / scale;
      const dy = (event.clientY - resize.startClientY) / scale;
      if (!resize.hasResized && Math.hypot(dx, dy) > 1.5) {
        pushCanvasUndoSnapshot('缩放画布元素');
        resize.hasResized = true;
      }
      const isWest = resize.corner.includes('w');
      const isNorth = resize.corner.includes('n');
      const rawWidth = isWest ? resize.startBounds.width - dx : resize.startBounds.width + dx;
      const rawHeight = isNorth ? resize.startBounds.height - dy : resize.startBounds.height + dy;
      const nextWidth = Math.max(120, Math.max(rawWidth, rawHeight * resize.aspect));
      const nextHeight = nextWidth / resize.aspect;
      const nextX = isWest ? resize.startBounds.x + resize.startBounds.width - nextWidth : resize.startBounds.x;
      const nextY = isNorth ? resize.startBounds.y + resize.startBounds.height - nextHeight : resize.startBounds.y;
      const factor = nextWidth / Math.max(1, resize.startBounds.width);
      const finalX = Math.max(0, nextX);
      const finalY = Math.max(0, nextY);
      const nextItemsById = Object.entries(resize.startItems).reduce<Record<string, CanvasItemBox>>((acc, [itemId, start]) => {
        acc[itemId] = {
          x: Math.max(0, finalX + (start.x - resize.startBounds.x) * factor),
          y: Math.max(0, finalY + (start.y - resize.startBounds.y) * factor),
          width: Math.max(48, start.width * factor),
          height: Math.max(36, start.height * factor),
        };
        return acc;
      }, {});
      const resized = Object.values(nextItemsById);
      if (resized.length > 0) {
        growCanvasToFit(
          Math.max(...resized.map(item => item.x + item.width)),
          Math.max(...resized.map(item => item.y + item.height))
        );
      }

      updateCanvasItemsInFrame(prev => prev.map(item => {
        const next = nextItemsById[item.id];
        if (!next) return item;
        return {
          ...item,
          x: next.x,
          y: next.y,
          width: next.width,
          height: next.height,
        };
      }));
    };
    const onUp = () => {
      flushCanvasItemsInFrame();
      canvasGroupResizeRef.current = null;
      setCanvasInteractionActive(false);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  };

  const startCanvasSelection = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isCanvasSpacePressedRef.current) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-canvas-item-id], [data-no-drag="true"], textarea, input, button, select, [contenteditable="true"]')) return;
    e.preventDefault();
    e.stopPropagation();
    const start = getCanvasPointFromClient(e.clientX, e.clientY);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    setCanvasInteractionActive(true);
    canvasSelectionDragRef.current = {
      pointerId: e.pointerId,
      startX: start.x,
      startY: start.y,
      additive,
      baseSelectedIds: canvasSelectedIdsRef.current,
    };
    setCanvasSelectionBox({ startX: start.x, startY: start.y, currentX: start.x, currentY: start.y });

    const onMove = (event: PointerEvent) => {
      const selection = canvasSelectionDragRef.current;
      if (!selection) return;
      event.preventDefault();
      event.stopPropagation();
      autoScrollCanvasNearEdge(event);
      const point = getCanvasPointFromClient(event.clientX, event.clientY);
      const nextBox = { startX: selection.startX, startY: selection.startY, currentX: point.x, currentY: point.y };
      setCanvasSelectionBox(nextBox);
      const rect = normalizeCanvasSelectionBox(nextBox);
      const hits = rect.width < 4 && rect.height < 4
        ? []
        : canvasItemsRef.current
          .filter(item => canvasRectsIntersect(rect, item))
          .map(item => item.id);
      updateCanvasSelection(selection.additive ? [...selection.baseSelectedIds, ...hits] : hits);
    };
    const onUp = (event: PointerEvent) => {
      const selection = canvasSelectionDragRef.current;
      if (selection) {
        const point = getCanvasPointFromClient(event.clientX, event.clientY);
        const rect = normalizeCanvasSelectionBox({ startX: selection.startX, startY: selection.startY, currentX: point.x, currentY: point.y });
        if (rect.width < 4 && rect.height < 4 && !selection.additive) updateCanvasSelection([]);
      }
      canvasSelectionDragRef.current = null;
      setCanvasInteractionActive(false);
      setCanvasSelectionBox(null);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  };

  const releaseCanvasScrollWriteGuard = () => {
    if (canvasScrollWriteFrameRef.current !== null) {
      cancelAnimationFrame(canvasScrollWriteFrameRef.current);
    }
    canvasScrollWriteFrameRef.current = requestAnimationFrame(() => {
      canvasScrollWriteFrameRef.current = null;
      canvasScrollWriteGuardRef.current = false;
    });
  };

  const writeCanvasSurfaceScroll = (
    surface: HTMLDivElement,
    left: number,
    top: number,
    updateLock = true
  ) => {
    canvasScrollWriteGuardRef.current = true;
    surface.scrollLeft = left;
    surface.scrollTop = top;
    if (updateLock) {
      canvasScrollLockRef.current = {
        left: surface.scrollLeft,
        top: surface.scrollTop,
      };
      scheduleCanvasStateSave();
    }
    releaseCanvasScrollWriteGuard();
  };

  const clampCanvasSurfaceScroll = (
    surface: HTMLDivElement,
    left: number,
    top: number,
    scale = canvasScaleRef.current || 1,
    size = canvasSizeRef.current
  ) => {
    const maxLeft = Math.max(0, size.width * scale - surface.clientWidth);
    const maxTop = Math.max(0, size.height * scale - surface.clientHeight);
    return {
      left: clamp(Number.isFinite(left) ? left : surface.scrollLeft, 0, maxLeft),
      top: clamp(Number.isFinite(top) ? top : surface.scrollTop, 0, maxTop),
    };
  };

  const centerCanvasItemInView = (canvasItem?: CanvasImageItem | null, options: { select?: boolean } = {}) => {
    const surface = canvasSurfaceRef.current;
    if (!surface || !canvasItem) return false;
    const scale = canvasScaleRef.current || 1;
    growCanvasToFit(canvasItem.x + canvasItem.width, canvasItem.y + canvasItem.height);
    canvasReturnScrollRef.current = null;
    writeCanvasSurfaceScroll(
      surface,
      Math.max(0, (canvasItem.x + canvasItem.width / 2) * scale - surface.clientWidth / 2),
      Math.max(0, (canvasItem.y + canvasItem.height / 2) * scale - surface.clientHeight / 2),
    );
    if (options.select) updateCanvasSelection([canvasItem.id]);
    return true;
  };

  const fitCanvasViewToItems = (ids?: string[]) => {
    const surface = canvasSurfaceRef.current;
    if (!surface) return false;
    const sourceItems = ids?.length
      ? canvasItemsRef.current.filter(item => ids.includes(item.id))
      : canvasItemsRef.current;
    const bounds = getCanvasBoundsFromItems(sourceItems);
    if (!bounds) return false;

    const padding = 160;
    const nextScale = clamp(
      Math.min(
        (surface.clientWidth - 56) / Math.max(1, bounds.width + padding * 2),
        (surface.clientHeight - 56) / Math.max(1, bounds.height + padding * 2)
      ),
      CANVAS_MIN_SCALE,
      Math.min(1.6, CANVAS_MAX_SCALE)
    );
    growCanvasToFit(bounds.x + bounds.width + padding, bounds.y + bounds.height + padding);
    canvasScaleRef.current = nextScale;
    applyCanvasScaleStyles(nextScale, canvasSizeRef.current);
    setCanvasScale(nextScale);
    writeCanvasSurfaceScroll(
      surface,
      Math.max(0, (bounds.x + bounds.width / 2) * nextScale - surface.clientWidth / 2),
      Math.max(0, (bounds.y + bounds.height / 2) * nextScale - surface.clientHeight / 2)
    );
    return true;
  };

  const focusCanvasItemById = (id?: string | null) => {
    if (!id) return false;
    return centerCanvasItemInView(canvasItemsRef.current.find(item => item.id === id), { select: true });
  };

  const scheduleCanvasFocusItemById = (id?: string | null) => {
    if (!id) return;
    pendingCanvasFocusItemIdRef.current = id;
    let frameAttempts = 0;
    const tryFocus = () => {
      if (!isCanvasModeRef.current || pendingCanvasFocusItemIdRef.current !== id) return;
      if (focusCanvasItemById(id)) {
        pendingCanvasFocusItemIdRef.current = null;
        return;
      }
      frameAttempts += 1;
      if (frameAttempts < 12) {
        window.requestAnimationFrame(tryFocus);
      }
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(tryFocus));
    window.setTimeout(tryFocus, 80);
    window.setTimeout(tryFocus, 220);
  };

  const startCanvasPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isCanvasSpacePressedRef.current && e.button !== 1 && !e.shiftKey) return;
    if (e.button !== 0 && e.button !== 1) return;
    const surface = canvasSurfaceRef.current;
    if (!surface) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setCanvasInteractionActive(true);
    canvasPanRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startScrollLeft: surface.scrollLeft,
      startScrollTop: surface.scrollTop,
    };
    canvasScrollLockRef.current = {
      left: surface.scrollLeft,
      top: surface.scrollTop,
    };

    const onMove = (event: PointerEvent) => {
      const pan = canvasPanRef.current;
      const targetSurface = canvasSurfaceRef.current;
      if (!pan || !targetSurface) return;
      event.preventDefault();
      event.stopPropagation();
      const scale = canvasScaleRef.current || 1;
      let nextLeft = pan.startScrollLeft - (event.clientX - pan.startClientX);
      let nextTop = pan.startScrollTop - (event.clientY - pan.startClientY);
      const growLeft = nextLeft < 0 ? CANVAS_GROW_CHUNK : 0;
      const growTop = nextTop < 0 ? CANVAS_GROW_CHUNK : 0;
      if (growLeft || growTop) {
        expandCanvasBeforeViewport(growLeft, growTop);
        nextLeft += growLeft * scale;
        nextTop += growTop * scale;
      }
      growCanvasToFit(
        (nextLeft + targetSurface.clientWidth) / scale + CANVAS_GROW_CHUNK * 0.8,
        (nextTop + targetSurface.clientHeight) / scale + CANVAS_GROW_CHUNK * 0.8
      );
      writeCanvasSurfaceScroll(targetSurface, nextLeft, nextTop);
    };
    const onUp = () => {
      canvasPanRef.current = null;
      setCanvasInteractionActive(false);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  };

  const zoomCanvasAt = (clientX: number, clientY: number, deltaY: number) => {
    const surface = canvasSurfaceRef.current;
    if (!surface) return;

    const previousScale = canvasScaleRef.current || 1;
    const nextScale = clamp(previousScale * Math.exp(-deltaY * 0.0008), CANVAS_MIN_SCALE, CANVAS_MAX_SCALE);
    if (Math.abs(nextScale - previousScale) < 0.001) return;

    const rect = surface.getBoundingClientRect();
    const localX = clamp(clientX - rect.left, 0, surface.clientWidth);
    const localY = clamp(clientY - rect.top, 0, surface.clientHeight);
    const canvasX = (surface.scrollLeft + localX) / previousScale;
    const canvasY = (surface.scrollTop + localY) / previousScale;
    const targetLeft = canvasX * nextScale - localX;
    const targetTop = canvasY * nextScale - localY;

    canvasScaleRef.current = nextScale;
    growCanvasToFit(
      (Math.max(0, targetLeft) + surface.clientWidth) / nextScale + CANVAS_GROW_CHUNK * 0.4,
      (Math.max(0, targetTop) + surface.clientHeight) / nextScale + CANVAS_GROW_CHUNK * 0.4
    );
    applyCanvasScaleStyles(nextScale, canvasSizeRef.current);
    const targetScroll = clampCanvasSurfaceScroll(surface, targetLeft, targetTop, nextScale, canvasSizeRef.current);
    writeCanvasSurfaceScroll(surface, targetScroll.left, targetScroll.top);
    commitCanvasScaleSoon();
  };

  const normalizeCanvasWheelDelta = (event: { deltaY: number; deltaMode: number }) => {
    let deltaY = event.deltaY;
    if (event.deltaMode === 1) {
      deltaY *= 40;
    } else if (event.deltaMode === 2) {
      deltaY *= Math.max(160, canvasSurfaceRef.current?.clientHeight || 800);
    }
    if (!Number.isFinite(deltaY)) return 0;
    return clamp(deltaY, -120, 120);
  };

  const getCanvasNestedWheelScroller = (surface: HTMLDivElement, targetValue: EventTarget | null, deltaY: number) => {
    const target = targetValue instanceof Element ? targetValue : null;
    if (!target || !surface.contains(target)) return null;
    if (!target.closest('textarea, input, [contenteditable="true"]')) return null;
    let current: HTMLElement | null = target instanceof HTMLElement ? target : target.parentElement;
    while (current && current !== surface) {
      const style = window.getComputedStyle(current);
      const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 1;
      if (canScrollY) {
        const canScrollUp = deltaY < 0 && current.scrollTop > 0;
        const canScrollDown = deltaY > 0 && current.scrollTop + current.clientHeight < current.scrollHeight - 1;
        return canScrollUp || canScrollDown ? current : null;
      }
      current = current.parentElement;
    }
    return null;
  };

  const shouldBlockCanvasWheelZoomTarget = (targetValue: EventTarget | null) => {
    const target = targetValue instanceof Element ? targetValue : null;
    if (!target) return false;
    return !!target.closest('textarea, input, [contenteditable="true"]');
  };

  useEffect(() => {
    if (!isCanvasMode) return;
    const surface = canvasSurfaceRef.current;
    if (!surface) return;

    const handleCanvasWheel = (event: WheelEvent) => {
      const deltaY = normalizeCanvasWheelDelta(event);
      if (getCanvasNestedWheelScroller(surface, event.target, deltaY)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (shouldBlockCanvasWheelZoomTarget(event.target)) return;
      zoomCanvasAt(event.clientX, event.clientY, deltaY);
    };

    surface.addEventListener('wheel', handleCanvasWheel, { passive: false, capture: true });
    return () => {
      surface.removeEventListener('wheel', handleCanvasWheel, true);
    };
  }, [isCanvasMode]);

  useEffect(() => {
    if (!isCanvasMode) return;
    const surface = canvasSurfaceRef.current;
    if (!surface) return;

    canvasScrollLockRef.current = {
      left: surface.scrollLeft,
      top: surface.scrollTop,
    };

    const handleCanvasScroll = () => {
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
  }, [isCanvasMode]);

  const handleCanvasDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const client = { x: e.clientX, y: e.clientY };
    lastCanvasDragClientRef.current = client;

    const drawerItemId = getDraggedDrawerItemId(e.dataTransfer);
    if (drawerItemId && await addDrawerImageItemToCanvas(drawerItemId, client)) {
      clearDrawerItemDragState();
      return;
    }

    const image = getWebImageFromDataTransfer(e.dataTransfer);
    const imageUrl = image?.url ? normalizeDraggedUrl(image.url) : '';
    if (imageUrl && /^(https?:|data:image\/)/i.test(imageUrl)) {
      await addCanvasWebImageUrl(imageUrl, image?.name, client);
      return;
    }

    const paths = getCanvasLocalPathsFromDataTransfer(e.dataTransfer);
    if (paths.length > 0) {
      await addCanvasDroppedPaths(paths, client);
      return;
    }

    if ((e.dataTransfer.files?.length || 0) > 0) {
      const added = await addCanvasDroppedFiles(e.dataTransfer.files, client);
      if (added) return;
    }

    showToast('无限画布只接收图片');
  };

  const leaveCanvasToDrawer = () => {
    const surface = canvasSurfaceRef.current;
    canvasReturnScrollRef.current = surface
      ? { left: surface.scrollLeft, top: surface.scrollTop }
      : canvasScrollLockRef.current;
    saveCanvasStateNow();
    keepCanvasSessionOnLeaveRef.current = true;
    isCanvasModeRef.current = false;
    setCanvasExitPromptStep('choice');
    setShowCanvasExitPrompt(false);
    setIsCanvasMode(false);
    setIsCanvasSpacePressed(false);
    updateCanvasSelection([]);
    setIsPinned(false);
    isPinnedRef.current = false;
    invoke('toggle_pin', { pinned: false }).catch(() => {});
    showToast(canvasItemsRef.current.length > 0 ? '已切回抽屉，画布内容已保留' : '已切回抽屉');
  };

  const closeCanvasExitPrompt = () => {
    setCanvasExitPromptStep('choice');
    setShowCanvasExitPrompt(false);
  };

  const requestExitCanvasMode = () => {
    if (canvasItemsRef.current.length === 0) {
      leaveCanvasToDrawer();
      return;
    }
    setCanvasExitPromptStep('choice');
    setShowCanvasExitPrompt(true);
  };

  const requestDiscardCanvasMode = () => {
    if (canvasItemsRef.current.length === 0) {
      discardCanvasMode();
      return;
    }
    setCanvasExitPromptStep('save');
    setShowCanvasExitPrompt(true);
  };

  const toggleCanvasMode = () => {
    if (isCanvasModeRef.current) requestExitCanvasMode();
    else enterCanvasMode();
  };

  useEffect(() => {
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
      if (isCanvasModeRef.current && !isTextEntryActive()) {
        const key = event.key.toLowerCase();
        const isMod = event.ctrlKey || event.metaKey;
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
          copyCanvasItems(selectedIds);
          return;
        }
        if (isMod && !event.altKey && key === 'v') {
          if (canvasClipboardRef.current.length === 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          pasteCanvasItems();
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
          setIsCanvasSpacePressed(true);
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
        if (removedCount > 0) showToast(`已删除 ${removedCount} 个画布元素`);
        return;
      }
      if (isCanvasModeRef.current && event.key === 'Escape') {
        if (canvasContextMenuRef.current || canvasSelectedIdsRef.current.length > 0 || canvasConnectionDraft || canvasInputPickTargetIdRef.current) {
          event.preventDefault();
          event.stopPropagation();
          setCanvasContextMenu(null);
          setCanvasInputMenuForId(null);
          setCanvasInputPickTargetId(null);
          setCanvasConnectionDraft(null);
          updateCanvasSelection([]);
          setCanvasSelectionBox(null);
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
      if (event.code === 'Space') {
        if (canvasSpaceKeyCapturedRef.current || isCanvasSpacePressedRef.current) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
        canvasSpaceKeyCapturedRef.current = false;
        setIsCanvasSpacePressed(false);
        canvasPanRef.current = null;
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
      setIsCanvasSpacePressed(false);
      canvasSpaceKeyCapturedRef.current = false;
      canvasPanRef.current = null;
    };
    const handleCanvasPaste = (event: ClipboardEvent) => {
      if (!isCanvasModeRef.current || isTextEntryActive()) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [data-canvas-edit-control="true"]')) return;
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;
      const hasImage = getCanvasClipboardImageFiles(clipboardData).length > 0;
      const hasText = !!clipboardData.getData('text/plain').trim();
      if (!hasImage && !hasText) return;
      event.preventDefault();
      event.stopPropagation();
      void pasteSystemClipboardToCanvas(clipboardData).catch((err) => {
        console.warn('粘贴剪贴板内容到画布失败:', err);
        showToast('粘贴失败');
      });
    };

    window.addEventListener('keydown', handleCanvasKeysDown, true);
    window.addEventListener('keyup', handleCanvasKeysUp, true);
    window.addEventListener('blur', handleCanvasKeyBlur);
    document.addEventListener('paste', handleCanvasPaste, true);
    return () => {
      window.removeEventListener('keydown', handleCanvasKeysDown, true);
      window.removeEventListener('keyup', handleCanvasKeysUp, true);
      window.removeEventListener('blur', handleCanvasKeyBlur);
      document.removeEventListener('paste', handleCanvasPaste, true);
    };
  }, []);

  useEffect(() => {
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
  }, []);

  const discardCanvasMode = () => {
    keepCanvasSessionOnLeaveRef.current = false;
    canvasReturnScrollRef.current = null;
    isCanvasModeRef.current = false;
    clearCanvasUndoStack();
    updateCanvasItemsImmediate(() => []);
    updateCanvasSelection([]);
    saveCanvasStateNow();
    setCanvasExitPromptStep('choice');
    setShowCanvasExitPrompt(false);
    setIsCanvasMode(false);
    setIsCanvasSpacePressed(false);
    setIsPinned(false);
    isPinnedRef.current = false;
    invoke('toggle_pin', { pinned: false }).catch(() => {});
    showToast('已退出无限画布');
  };

  const saveCanvasToDrawer = () => {
    const snapshots = canvasItemsRef.current;
    if (snapshots.length === 0) {
      discardCanvasMode();
      return;
    }
    const now = Date.now();
    const folderName = `临时画布 ${new Date(now).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(/[/:]/g, '-').replace(/\s+/g, ' ')}`;
    const newFolder: Folder = {
      id: Math.random().toString(36).substring(2, 9),
      name: folderName,
      color: '#f59e0b',
    };
    const existingDrawerIds = new Set(itemsRef.current.map(item => item.id));
    const usedSavedIds = new Set<string>();
    const savedItems = snapshots.map(snapshot => {
      const desiredId = snapshot.item.id || '';
      const needsFreshId = !desiredId || existingDrawerIds.has(desiredId) || usedSavedIds.has(desiredId);
      const id = needsFreshId ? Math.random().toString(36).substring(2, 9) : desiredId;
      usedSavedIds.add(id);
      return {
        ...snapshot.item,
        id,
        folderId: newFolder.id,
        createdAt: snapshot.item.createdAt || now,
      } as BufferItem;
    });

    pushDrawerUndoSnapshot('保存画布');
    setFolders(prev => [...prev, newFolder]);
    setItems(prev => [...savedItems, ...prev]);
    triggerAutoPaletteForItems(savedItems);
    keepCanvasSessionOnLeaveRef.current = false;
    canvasReturnScrollRef.current = null;
    isCanvasModeRef.current = false;
    clearCanvasUndoStack();
    updateCanvasItemsImmediate(() => []);
    updateCanvasSelection([]);
    saveCanvasStateNow();
    setCanvasExitPromptStep('choice');
    setShowCanvasExitPrompt(false);
    setIsCanvasMode(false);
    setIsCanvasSpacePressed(false);
    setIsPinned(false);
    isPinnedRef.current = false;
    invoke('toggle_pin', { pinned: false }).catch(() => {});
    setActiveFolderId(newFolder.id);
    setActiveTab('all');
    showToast(`已保存 ${savedItems.length} 个画布元素到 ${folderName}`);
  };

  const addDroppedPaths = async (paths: string[]) => {
    const cleanPaths = Array.from(new Set((paths || []).filter(Boolean)));
    if (cleanPaths.length === 0) return;

    const key = cleanPaths.join('\n');
    const now = Date.now();
    if (key === lastDroppedPathsKeyRef.current && now - lastNativeDropAtRef.current < 600) return;
    lastDroppedPathsKeyRef.current = key;
    lastNativeDropAtRef.current = now;

    const newItems = await Promise.all(cleanPaths.map(async originalPath => {
      let path = originalPath;
      let fileName = path.split(/[\\/]/).pop() || '未知文件';
      let ext = fileName.split('.').pop()?.toLowerCase() || '';

      let kind: 'file' | 'directory' | 'missing' = 'file';
      try {
        kind = await invoke<'file' | 'directory' | 'missing'>('path_kind', { path });
      } catch (_) {
        kind = 'file';
      }

      const isDirectory = kind === 'directory';
      let type: 'image' | 'video' | 'file' | 'text' = 'file';
      if (!isDirectory && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) type = 'image';
      else if (!isDirectory && ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) type = 'video';

      const originalSourcePath = path;
      const latestCacheDir = await getLatestFileCacheDir();

      // 有些浏览器/Windows OLE 拖网页图片时不会给 URL，只给一个已经落到 App 默认目录的临时文件路径。
      // 这类路径不会经过 addWebImageUrl，所以这里再兜底把 App 默认缓存里的图片迁移到用户设置的缓存目录。
      if (type === 'image' && !isDirectory && latestCacheDir) {
        try {
          const relocatedPath = await invoke<string>('relocate_web_cache_file', {
            path,
            dir: latestCacheDir,
          });
          if (relocatedPath) {
            path = relocatedPath;
            fileName = path.split(/[\\/]/).pop() || fileName;
            ext = fileName.split('.').pop()?.toLowerCase() || ext;
          }
        } catch (err) {
          console.warn('文件缓存路径迁移失败:', err);
        }
      }


      // 本地拖入的文件/图片/视频统一复制一份到缓存目录，卡片后续指向缓存副本。
      // 这样即使原文件被移动，抽屉里的灵感也还能打开、预览和炼金。
      if (!isDirectory) {
        try {
          const cachedPath = await invoke<string>('cache_local_file_to_dir', {
            path,
            dir: latestCacheDir || undefined,
          });
          if (cachedPath) {
            path = cachedPath;
            fileName = path.split(/[\\/]/).pop() || fileName;
            ext = fileName.split('.').pop()?.toLowerCase() || ext;
          }
        } catch (err) {
          console.warn('本地文件缓存失败，保留原路径:', err);
        }
      }

      const assetUrl = isDirectory ? '' : convertFileSrc(path);
      let thumbnail = '';
      if (type === 'video' && !isDirectory) {
        try {
          thumbnail = await getVideoThumbnail(path);
        } catch (err) {
          console.warn('视频缩略图生成失败:', err);
          thumbnail = '';
        }
      }

      return {
        id: Math.random().toString(36).substring(2, 9),
        type, content: fileName, name: fileName, path, url: assetUrl, thumbnail: thumbnail || undefined,
        sourceUrl: originalSourcePath !== path ? originalSourcePath : undefined,
        originalUrl: originalSourcePath !== path ? originalSourcePath : undefined,
        createdAt: Date.now(), isQuickAccess: false,
        folderId: activeFolderIdRef.current !== 'all' ? activeFolderIdRef.current : undefined,
        isDirectory,
      } as BufferItem & { isDirectory?: boolean };
    }));

    pushDrawerUndoSnapshot('拖入素材');
    setItems(prev => [...newItems, ...prev]);
    triggerAutoPaletteForItems(newItems as BufferItem[]);
    setActiveTab('all');
    setIsOpen(true);
  };

  const addWebImageUrl = (url: string, name?: string) => {
    const normalizedUrl = normalizeDraggedUrl(url);
    if (!normalizedUrl) return;
    const now = Date.now();
    if (normalizedUrl === lastWebImageUrlRef.current && now - lastWebImageDropAtRef.current < 900) return;
    lastWebImageUrlRef.current = normalizedUrl;
    lastWebImageDropAtRef.current = now;

    const itemId = Math.random().toString(36).substring(2, 9);
    const displayName = name || getNameFromUrl(normalizedUrl);
    const newItem: BufferItem = {
      id: itemId,
      type: 'image',
      content: displayName,
      name: displayName,
      url: normalizedUrl,
      path: normalizedUrl,
      sourceUrl: normalizedUrl,
      originalUrl: normalizedUrl,
      createdAt: Date.now(),
      isQuickAccess: false,
      folderId: activeFolderIdRef.current !== 'all' ? activeFolderIdRef.current : undefined,
    };
    pushDrawerUndoSnapshot('添加网页图片');
    setItems(prev => [newItem, ...prev]);
    triggerAutoPaletteForItems([newItem]);
    setActiveTab('image');
    setIsOpen(true);
    showToast('已添加网页图片，正在缓存');

    const latestCacheDir = (
      webImageCacheDirRef.current ||
      localStorage.getItem('drawer_web_image_cache_dir') ||
      ''
    ).trim();

    invoke<string>('cache_web_image', {
      url: normalizedUrl,
      name: displayName,
      dir: latestCacheDir || undefined,
    })
      .then((cachedPath) => {
        if (!cachedPath) return;
        const cachedUrl = convertFileSrc(cachedPath);
        const cachedItem = {
          ...newItem,
          url: cachedUrl,
          path: cachedPath,
          sourceUrl: normalizedUrl,
          originalUrl: normalizedUrl,
        } as BufferItem;
        setItems(prev => prev.map(item => item.id === itemId ? cachedItem : item));
        triggerAutoPaletteForItems([cachedItem]);
        showToast('网页图片已缓存');
      })
      .catch((err) => {
        console.warn('网页图片缓存失败:', err);
        showToast('网页图片已添加，缓存失败');
      });
  };

  // Windows 原生 OLE 拖拽：统一接收本地源路径 + 网页图片 URL。
  // Rust 后端会发 native-drop，payload.paths 是本地文件/文件夹源路径，
  // payload.web_images 是从 HTML Format / URL / 文本中解析到的网页图片。
  useEffect(() => {
    let unlistenNativeDrop: (() => void) | undefined;
    let unlistenNativeDragEnter: (() => void) | undefined;
    let unlistenNativeDragLeave: (() => void) | undefined;

    listen('native-drag-enter', () => {
      setIsDraggingOver(true);
      if (isCanvasModeRef.current) {
        setIsOpen(true);
        setIsPinned(true);
        isPinnedRef.current = true;
        setDrawerState('open');
        return;
      }
      if (!stateRef.current.isAntiTouchMode) {
        setIsOpen(true);
        // 如果抽屉已经打开/钉住，说明用户可能已经把它拖到别的位置了。
        // 不再调用后端 open_drawer，避免外部拖入文件时把窗口重新吸附回屏幕右侧。
        if (!stateRef.current.isOpen && !isPinnedRef.current) {
          invoke('open_drawer', { width: drawerWidthRef.current, height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});
        }
      }
    }).then(f => unlistenNativeDragEnter = f);

    listen('native-drag-leave', () => {
      setIsDraggingOver(false);
      if (isCanvasModeRef.current) return;
      if (!isPinnedRef.current && !showLaunchIntroRef.current && !isSplashVisibleRef.current && !showUpdateLogRef.current) setIsOpen(false);
    }).then(f => unlistenNativeDragLeave = f);

    listen('native-drop', (event: any) => {
      setIsDraggingOver(false);
      if (stateRef.current.isAntiTouchMode) return;
      const payload = event.payload as {
        paths?: string[];
        web_images?: { url?: string; name?: string }[];
        texts?: string[];
      };

      const webImages = Array.isArray(payload.web_images)
        ? payload.web_images.filter(image => image?.url)
        : [];

      // 原生 OLE 拖网页图片时可能同时返回 paths + web_images。
      // 有 web_images 时只走网页图片缓存链路，避免把临时文件路径误加入抽屉。
      if (isCanvasModeRef.current) {
        const client = lastCanvasDragClientRef.current || undefined;
        if (webImages.length > 0) {
          for (const image of webImages) {
            void addCanvasWebImageUrl(image.url as string, image.name, client);
          }
        } else if (Array.isArray(payload.paths) && payload.paths.length > 0) {
          if (Date.now() - lastCanvasDropAtRef.current < 700) return;
          void addCanvasDroppedPaths(payload.paths, client);
        }
      } else if (webImages.length > 0) {
        for (const image of webImages) {
          addWebImageUrl(image.url as string, image.name);
        }
      } else if (Array.isArray(payload.paths) && payload.paths.length > 0) {
        void addDroppedPaths(payload.paths);
      }

      if ((payload.paths?.length || 0) > 0 || (payload.web_images?.length || 0) > 0) {
        setIsOpen(true);
      }
    }).then(f => unlistenNativeDrop = f);

    return () => {
      if (unlistenNativeDrop) unlistenNativeDrop();
      if (unlistenNativeDragEnter) unlistenNativeDragEnter();
      if (unlistenNativeDragLeave) unlistenNativeDragLeave();
    };
  }, []);

  // Tauri 原生文件拖入：负责拿到真实文件路径。
  useEffect(() => {
    const unlistenPromise = appWindow.onDragDropEvent((event) => {
      const type = (event.payload as any).type;
      if (type === 'enter' || type === 'over') {
        setIsDraggingOver(true);
        if (isCanvasModeRef.current) {
          setIsOpen(true);
          setIsPinned(true);
          isPinnedRef.current = true;
          setDrawerState('open');
          return;
        }
        if (!stateRef.current.isAntiTouchMode) {
          setIsOpen(true);
          // 兜底：Tauri 原生监听如果仍然触发，也不要在已打开/钉住时重置窗口位置。
          if (!stateRef.current.isOpen && !isPinnedRef.current) {
            invoke('open_drawer', { width: drawerWidthRef.current, height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});
          }
        }
      } else if (type === 'leave') {
        setIsDraggingOver(false);
        if (isCanvasModeRef.current) return;
        if (!isPinnedRef.current && !showLaunchIntroRef.current && !isSplashVisibleRef.current && !showUpdateLogRef.current) setIsOpen(false);
      } else if (type === 'drop') {
        setIsDraggingOver(false);
        if (stateRef.current.isAntiTouchMode) return;
        // DOM/edge/native 网页图片 drop 之后，Tauri 可能还会紧接着派发一次临时文件 paths。
        // 这时不要再把临时文件当成本地图片加入抽屉，否则会绕过自定义网页缓存目录。
        if (Date.now() - lastWebImageDropAtRef.current < 1500) return;
        const paths = (event.payload as any).paths as string[];
        if (isCanvasModeRef.current) {
          if (Date.now() - lastCanvasDropAtRef.current < 700) return;
          void addCanvasDroppedPaths(paths || [], lastCanvasDragClientRef.current || undefined);
        } else {
          void addDroppedPaths(paths || []);
        }
      }
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten()).catch(() => {});
    };
  }, []);


  // 如果文件被直接松手到 edge 小条/悬浮方块窗口，edge 会把真实路径转发到 main。
  useEffect(() => {
    let unlistenFiles: (() => void) | undefined;
    let unlistenWebImage: (() => void) | undefined;
    listen('edge-files-dropped', (event: any) => {
      if (stateRef.current.isAntiTouchMode) return;
      if (Date.now() - lastWebImageDropAtRef.current < 1500) return;
      const paths = event.payload as string[];
      if (Array.isArray(paths) && paths.length > 0) {
        if (isCanvasModeRef.current) {
          if (Date.now() - lastCanvasDropAtRef.current < 700) return;
          void addCanvasDroppedPaths(paths, lastCanvasDragClientRef.current || undefined);
        }
        else void addDroppedPaths(paths);
      }
    }).then(f => unlistenFiles = f);
    listen('edge-web-image-dropped', (event: any) => {
      if (stateRef.current.isAntiTouchMode) return;
      const payload = event.payload as { url?: string; name?: string };
      if (payload?.url) {
        if (isCanvasModeRef.current) void addCanvasWebImageUrl(payload.url, payload.name, lastCanvasDragClientRef.current || undefined);
        else addWebImageUrl(payload.url, payload.name);
      }
    }).then(f => unlistenWebImage = f);
    return () => {
      if (unlistenFiles) unlistenFiles();
      if (unlistenWebImage) unlistenWebImage();
    };
  }, []);

  // DOM 拖拽只处理网页图片。
  // 本地文件/本地图片/文件夹必须走 Tauri 原生 drag-drop，才能拿到源路径；
  // DOM File 无法暴露真实路径，因此这里绝不再复制到 app data/uploads。
  useEffect(() => {
    const hasLocalFileLikeData = (dt?: DataTransfer | null) => {
      if (!dt) return false;
      return (dt.files?.length || 0) > 0 || Array.from(dt.items || []).some(item => item.kind === 'file');
    };

    const getExternalWebImage = (dt?: DataTransfer | null) => {
      const image = getWebImageFromDataTransfer(dt);
      const imageUrl = image?.url ? normalizeDraggedUrl(image.url) : '';
      if (image?.url && /^(https?:|data:image\/)/i.test(imageUrl)) return image;
      return null;
    };

    const hasPotentialWebImageData = (dt?: DataTransfer | null) => {
      if (!dt) return false;
      const image = getExternalWebImage(dt);
      if (image?.url) return true;
      if (hasLocalFileLikeData(dt)) return false;
      const types = Array.from(dt.types || []);
      return types.some(type => [
        'DownloadURL',
        'text/html',
        'text/uri-list',
        'text/x-moz-url',
        'text/plain',
      ].includes(type));
    };

    const handleDomDragOver = (event: DragEvent) => {
      if (stateRef.current.isAntiTouchMode) return;
      if (!hasPotentialWebImageData(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const handleDomDrop = (event: DragEvent) => {
      if (stateRef.current.isAntiTouchMode) return;
      const image = getExternalWebImage(event.dataTransfer);
      if (!image) return;

      event.preventDefault();
      event.stopPropagation();
      if (isCanvasModeRef.current) {
        void addCanvasWebImageUrl(image.url, image.name, { x: event.clientX, y: event.clientY });
        return;
      }
      addWebImageUrl(image.url, image.name);
    };

    window.addEventListener('dragenter', handleDomDragOver, true);
    window.addEventListener('dragover', handleDomDragOver, true);
    window.addEventListener('drop', handleDomDrop, true);
    document.addEventListener('dragenter', handleDomDragOver, true);
    document.addEventListener('dragover', handleDomDragOver, true);
    document.addEventListener('drop', handleDomDrop, true);
    return () => {
      window.removeEventListener('dragenter', handleDomDragOver, true);
      window.removeEventListener('dragover', handleDomDragOver, true);
      window.removeEventListener('drop', handleDomDrop, true);
      document.removeEventListener('dragenter', handleDomDragOver, true);
      document.removeEventListener('dragover', handleDomDragOver, true);
      document.removeEventListener('drop', handleDomDrop, true);
    };
  }, []);

  const handleAddFolder = () => {
    if (!newFolderName.trim()) return;
    const newFolder: Folder = { id: Math.random().toString(36).substring(2, 9), name: newFolderName.trim(), color: '#10b981' };
    pushDrawerUndoSnapshot('新建文件夹');
    setFolders([...folders, newFolder]); setNewFolderName(''); setShowFolderModal(false); showToast('文件夹创建成功');
  };

  const handleDeleteFolder = (id: string) => {
    pushDrawerUndoSnapshot('删除文件夹');
    setFolders(folders.filter(f => f.id !== id));
    setItems(items.map(i => i.folderId === id ? { ...i, folderId: undefined } : i));
    if (activeFolderId === id) setActiveFolderId('all');
    showToast('文件夹已删除，内容已移回主抽屉');
  };

  const getDraggedDrawerItemId = (dt?: DataTransfer | null) => {
    if (!dt) return draggingItemIdRef.current || '';
    return (
      dt.getData('application/drawer-item-id') ||
      dt.getData('application/x-drawer-item-id') ||
      dt.getData('text/plain') ||
      draggingItemIdRef.current ||
      ''
    );
  };

  const moveDrawerItemToFolder = (itemId: string, folderId?: string, folderName?: string) => {
    if (!itemId || !items.some(i => i.id === itemId)) return false;
    const currentFolderId = items.find(i => i.id === itemId)?.folderId;
    if ((currentFolderId || undefined) === folderId) return false;
    pushDrawerUndoSnapshot(folderId ? '移动到文件夹' : '移出文件夹');
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, folderId } : i));
    showToast(folderId ? `已归类至 ${folderName || '文件夹'}` : '已移出至主抽屉');
    return true;
  };

  const sanitizeExportFileName = (name: string, fallback = '灵感卡片') => {
    const cleaned = (name || fallback)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.\s]+$/g, '');
    return (cleaned || fallback).slice(0, 120);
  };

  const extensionFromValue = (value?: string | null) => {
    const clean = String(value || '').split('?')[0].split('#')[0];
    const name = clean.split(/[\\/]/).pop() || '';
    const ext = name.includes('.') ? name.split('.').pop() || '' : '';
    return ext.toLowerCase();
  };

  const exportFileNameForItem = (item: BufferItem, index: number, used: Set<string>) => {
    const created = item.createdAt ? new Date(item.createdAt) : new Date();
    const time = Number.isFinite(created.getTime())
      ? `${created.getFullYear()}${String(created.getMonth() + 1).padStart(2, '0')}${String(created.getDate()).padStart(2, '0')}_${String(created.getHours()).padStart(2, '0')}${String(created.getMinutes()).padStart(2, '0')}${String(created.getSeconds()).padStart(2, '0')}`
      : `${Date.now()}`;
    const baseRaw = item.name || item.content || `${item.type || 'item'}_${time}_${index + 1}`;
    let base = sanitizeExportFileName(baseRaw, `灵感卡片_${index + 1}`);
    let ext = extensionFromValue(base);

    if (!ext) {
      if (item.type === 'text') ext = 'txt';
      else if (item.type === 'image') ext = extensionFromValue(item.path || item.url) || 'png';
      else if (item.type === 'video') ext = extensionFromValue(item.path || item.url) || 'mp4';
      else ext = extensionFromValue(item.path || item.url) || 'dat';
      base = `${base}.${ext}`;
    }

    let candidate = base;
    let count = 2;
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const suffix = dot > 0 ? base.slice(dot) : '';
    while (used.has(candidate.toLowerCase())) {
      candidate = `${stem}_${count}${suffix}`;
      count += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  };

  const handleExportSelectedItems = async () => {
    const selectedItems = items.filter(item => selectedIds.includes(item.id));
    if (selectedItems.length === 0) return;

    try {
      const targetDir = await open({
        directory: true,
        multiple: false,
        title: '选择导出文件夹',
      });
      if (typeof targetDir !== 'string' || !targetDir) return;

      const separator = targetDir.includes('\\') ? '\\' : '/';
      const baseDir = targetDir.replace(/[\\/]+$/g, '');
      const used = new Set<string>();
      let exported = 0;
      let skipped = 0;

      for (const [index, item] of selectedItems.entries()) {
        if ((item as any).isDirectory) {
          skipped += 1;
          continue;
        }
        const fileName = exportFileNameForItem(item, index, used);
        const dest = `${baseDir}${separator}${fileName}`;
        const source = item.path || item.url || item.content || '';
        try {
          await invoke('save_item_source_as', {
            source,
            dest,
            content: item.content || '',
            itemType: item.type,
          });
          exported += 1;
        } catch (err) {
          console.warn('导出失败:', item, err);
          skipped += 1;
        }
      }

      showToast(skipped > 0 ? `已导出 ${exported} 个，跳过/失败 ${skipped} 个` : `已导出 ${exported} 个文件`);
      if (exported > 0) {
        setSelectedIds([]);
        setIsSelectMode(false);
      }
    } catch (err) {
      console.error('批量导出失败:', err);
      showToast('导出失败');
    }
  };

  const downloadBufferItems = async (sourceItems: BufferItem[]) => {
    const cleanItems = sourceItems.filter(item => item && !(item as any).isDirectory);
    if (cleanItems.length === 0) {
      showToast('没有可下载的内容');
      return;
    }

    try {
      if (cleanItems.length === 1) {
        const item = cleanItems[0];
        const fileName = exportFileNameForItem(item, 0, new Set());
        const savePath = await save({
          defaultPath: fileName,
          filters: item.type === 'image'
            ? [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] }]
            : item.type === 'text'
              ? [{ name: 'Text', extensions: ['txt'] }]
              : item.type === 'video'
                ? [{ name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }]
                : [{ name: 'All Files', extensions: ['*'] }],
        });
        if (!savePath) return;

        await invoke('save_item_source_as', {
          source: item.path || item.url || item.content || '',
          dest: savePath,
          content: item.content || '',
          itemType: item.type,
        });
        showToast('已下载');
        return;
      }

      const targetDir = await open({
        directory: true,
        multiple: false,
        title: '选择下载文件夹',
      });
      if (typeof targetDir !== 'string' || !targetDir) return;

      const separator = targetDir.includes('\\') ? '\\' : '/';
      const baseDir = targetDir.replace(/[\\/]+$/g, '');
      const used = new Set<string>();
      let downloaded = 0;
      let skipped = 0;
      for (const [index, item] of cleanItems.entries()) {
        const fileName = exportFileNameForItem(item, index, used);
        const dest = `${baseDir}${separator}${fileName}`;
        try {
          await invoke('save_item_source_as', {
            source: item.path || item.url || item.content || '',
            dest,
            content: item.content || '',
            itemType: item.type,
          });
          downloaded += 1;
        } catch (err) {
          console.warn('下载失败:', item, err);
          skipped += 1;
        }
      }
      showToast(skipped > 0 ? `已下载 ${downloaded} 个，失败 ${skipped} 个` : `已下载 ${downloaded} 个文件`);
    } catch (err) {
      console.error('下载失败:', err);
      showToast('下载失败');
    }
  };

  const downloadCanvasItemsByIds = async (ids: string[]) => {
    const idSet = new Set(ids.filter(Boolean));
    const sourceItems = canvasItemsRef.current
      .filter(canvasItem => idSet.has(canvasItem.id))
      .flatMap(canvasItem => {
        if (!isCanvasAiGeneratorType(canvasItem.ai?.type) && canvasItem.ai?.type !== 'workflow') return [canvasItem.item];
        const outputItems = getCanvasAiSuccessfulOutputs(canvasItem)
          .map((output, index) => createCanvasAiOutputBufferItem(canvasItem, output, index))
          .filter((item): item is BufferItem => !!item);
        return outputItems.length > 0 ? outputItems : [canvasItem.item];
      });
    await downloadBufferItems(sourceItems);
  };

  const moveSelectedItemsToFolder = (folderId?: string, folderName?: string) => {
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);
    const count = selectedIds.length;
    pushDrawerUndoSnapshot(folderId ? '批量移动到文件夹' : '批量移出文件夹');
    setItems(prev => prev.map(item => idSet.has(item.id) ? { ...item, folderId } : item));
    setSelectedIds([]);
    setIsSelectMode(false);
    setShowMoveFolderModal(false);
    showToast(folderId ? `已移动 ${count} 个到 ${folderName || '文件夹'}` : `已移动 ${count} 个到主抽屉`);
  };

  const createFolderAndMoveSelected = () => {
    const name = moveFolderName.trim();
    if (!name || selectedIds.length === 0) return;
    const newFolder: Folder = { id: Math.random().toString(36).substring(2, 9), name, color: '#10b981' };
    const idSet = new Set(selectedIds);
    const count = selectedIds.length;
    pushDrawerUndoSnapshot('新建文件夹并移动');
    setFolders(prev => [...prev, newFolder]);
    setItems(prev => prev.map(item => idSet.has(item.id) ? { ...item, folderId: newFolder.id } : item));
    setMoveFolderName('');
    setSelectedIds([]);
    setIsSelectMode(false);
    setShowMoveFolderModal(false);
    showToast(`已新建并移动 ${count} 个到 ${name}`);
  };

  const clearDrawerItemDragState = () => {
    setDraggingItemId(null);
    setDragOverFolderId(null);
    draggingItemIdRef.current = null;
    isGlobalMouseDown.current = false;
    document.body.style.cursor = '';
  };

  const handleDrawerItemDropToFolder = (e: React.DragEvent, folderId?: string, folderName?: string) => {
    e.preventDefault();
    e.stopPropagation();

    const itemId = getDraggedDrawerItemId(e.dataTransfer);
    moveDrawerItemToFolder(itemId, folderId, folderName);
    clearDrawerItemDragState();
  };

  const handleDrawerItemDragOverFolder = (e: React.DragEvent, folderId: string) => {
    const itemId = getDraggedDrawerItemId(e.dataTransfer);
    if (!itemId || !items.some(i => i.id === itemId)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  };

  const handleDrawerItemDragLeaveFolder = (e: React.DragEvent, folderId: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOverFolderId(prev => prev === folderId ? null : prev);
  };

  const handleDrawerFolderPointerEnter = (folderId: string) => {
    if (draggingItemIdRef.current) setDragOverFolderId(folderId);
  };

  const handleDrawerFolderPointerLeave = (folderId: string) => {
    if (draggingItemIdRef.current) {
      setDragOverFolderId(prev => prev === folderId ? null : prev);
    }
  };

  const handleDrawerFolderPointerUp = (folderId?: string, folderName?: string) => {
    const itemId = draggingItemIdRef.current;
    if (!itemId) return;
    moveDrawerItemToFolder(itemId, folderId, folderName);
    clearDrawerItemDragState();
  };

  const handleDrawerItemSelect = (itemId: string, event?: React.MouseEvent) => {
    const visibleIds = displayItems.map(item => item.id);
    const lastId = lastSelectedDrawerItemIdRef.current;
    if (event?.shiftKey && lastId && visibleIds.includes(lastId) && visibleIds.includes(itemId)) {
      const start = visibleIds.indexOf(lastId);
      const end = visibleIds.indexOf(itemId);
      const rangeIds = visibleIds.slice(Math.min(start, end), Math.max(start, end) + 1);
      setSelectedIds(prev => Array.from(new Set([...prev, ...rangeIds])));
    } else {
      setSelectedIds(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
    }
    lastSelectedDrawerItemIdRef.current = itemId;
  };

  const getExternalDragSourcesForItem = (itemId: string) => {
    const dragIds = selectedIds.includes(itemId) && selectedIds.length > 1 ? selectedIds : [itemId];
    return items
      .filter(item => dragIds.includes(item.id))
      .filter(item => item.type === 'image' || item.type === 'file' || item.type === 'video')
      .map(item => normalizeLocalDragPath(item.path || item.url || item.content))
      .filter(Boolean);
  };

  const startNativeDrawerItemDrag = async (itemId: string) => {
    const paths = getExternalDragSourcesForItem(itemId);
    if (paths.length === 0) return false;
    try {
      await invoke('start_file_drag', { paths });
    } catch (err) {
      console.warn('系统文件拖拽失败:', err);
      try {
        await invoke('copy_files_to_clipboard', { paths });
        showToast(paths.length > 1 ? '已复制这些文件，可直接粘贴到目标程序' : '已复制文件，可直接粘贴到目标程序');
      } catch (clipboardErr) {
        console.warn('复制文件兜底失败:', clipboardErr);
        showToast('拖出失败：找不到可拖拽的本地文件');
      }
    } finally {
      isPointerInsideDrawerRef.current = false;
      clearIdleAutoClose();
      window.setTimeout(() => scheduleAutoClose(120), 0);
    }
    return true;
  };

  const startDrawerItemPointerDrag = (e: React.PointerEvent, itemId: string) => {
    if (e.button !== 0 || isResizingCards) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest('button,input,textarea,select,a,[role="button"],[contenteditable="true"],[data-no-drag="true"],[title*="复制"],[title*="文件夹"],[title*="显示"],[aria-label]')) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let activated = false;
    let disposed = false;
    let nativeDragStarted = false;

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', cleanup, true);
      clearDrawerItemDragState();
    };

    const onMove = (me: PointerEvent) => {
      if (disposed) return;
      const distance = Math.hypot(me.clientX - startX, me.clientY - startY);
      if (!activated && distance < 6) return;

      if (!activated) {
        activated = true;
        draggingItemIdRef.current = itemId;
        setDraggingItemId(itemId);
        isGlobalMouseDown.current = true;
        document.body.style.cursor = 'grabbing';
      }

      const isAtWindowEdge =
        me.clientX <= 12 ||
        me.clientY <= 12 ||
        me.clientX >= window.innerWidth - 12 ||
        me.clientY >= window.innerHeight - 12;
      if (isAtWindowEdge && !nativeDragStarted) {
        nativeDragStarted = true;
        cleanup();
        void startNativeDrawerItemDrag(itemId);
        return;
      }

      me.preventDefault();
    };

    const onUp = (me: PointerEvent) => {
      if (activated) {
        const canvasEl = canvasSurfaceRef.current;
        if (isCanvasModeRef.current && canvasEl) {
          const rect = canvasEl.getBoundingClientRect();
          const isInsideCanvas = me.clientX >= rect.left && me.clientX <= rect.right && me.clientY >= rect.top && me.clientY <= rect.bottom;
          if (isInsideCanvas) {
            void addDrawerImageItemToCanvas(itemId, { x: me.clientX, y: me.clientY });
            cleanup();
            return;
          }
        }

        const el = document.elementFromPoint(me.clientX, me.clientY) as HTMLElement | null;
        const dropEl = el?.closest('[data-folder-drop-id]') as HTMLElement | null;
        if (dropEl) {
          const id = dropEl.dataset.folderDropId || 'all';
          const folderName = dropEl.dataset.folderDropName;
          moveDrawerItemToFolder(itemId, id === 'all' ? undefined : id, folderName);
        }
      }
      cleanup();
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', cleanup, true);
  };

  const handleRenameFolder = (id: string) => {
    const nextName = renameValue.trim();
    const current = folders.find(f => f.id === id);
    if (nextName && current && current.name !== nextName) {
      pushDrawerUndoSnapshot('重命名文件夹');
      setFolders(folders.map(f => f.id === id ? { ...f, name: nextName } : f));
      showToast('文件夹已重命名');
    }
    setEditingFolderId(null);
  };

  const handleCloseTextInput = () => { setShowTextInput(false); };

  const [drawerWidth, setDrawerWidth] = useState(() => {
      migrateDrawerSizeDefaults();
      const w = Number(localStorage.getItem('drawer_width'));
      const max = MAX_DRAWER_WIDTH;
      return (!w || Number.isNaN(w) || w < MIN_DRAWER_WIDTH || w > max) ? DEFAULT_DRAWER_WIDTH : w;
  });
  const [drawerHeight, setDrawerHeight] = useState(() => {
      const h = Number(localStorage.getItem('drawer_height'));
      const max = MAX_DRAWER_HEIGHT;
      return (!h || Number.isNaN(h) || h < MIN_DRAWER_HEIGHT || h > max) ? DEFAULT_DRAWER_HEIGHT : h;
  });

  const isResizingState = useRef(false);

  useEffect(() => { localStorage.setItem('drawer_width', drawerWidth.toString()); }, [drawerWidth]);
  useEffect(() => { localStorage.setItem('drawer_height', drawerHeight.toString()); }, [drawerHeight]);


  const [drawerState, setDrawerState] = useState<'closed' | 'pre_open' | 'open' | 'closing'>(() => shouldShowInitialLaunchIntro() ? 'pre_open' : 'closed');

  const isPointerInsideDrawerRef = useRef(false);
  const lastDrawerPointerDownAtRef = useRef(0);
  const drawerWidthRef = useRef(drawerWidth);
  const drawerHeightRef = useRef(drawerHeight);
  const pendingBoundsRef = useRef<{ width: number; height: number; anchor?: 'left' | 'right' } | null>(null);
  const boundsFrameRef = useRef<number | null>(null);
  const boundsInvokeInFlightRef = useRef(false);
  const boundsSyncRequestedRef = useRef(false);
  const drawerResizeAnchorRef = useRef<'left' | 'right'>('right');
  const snipCaptureInFlightRef = useRef(false);
  const handledSnipPathsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => { drawerWidthRef.current = drawerWidth; }, [drawerWidth]);
  useEffect(() => { drawerHeightRef.current = drawerHeight; }, [drawerHeight]);

  const openSelectedImagePreview = (url: string, options: { fromCanvas?: boolean } = {}) => {
    const source = String(url || '').trim();
    if (!source) return;
    selectedImageReturnToCanvasRef.current = !!options.fromCanvas;
    setSelectedImage(source);
  };

  const closeSelectedImagePreview = () => {
    const shouldReturnToCanvas = selectedImageReturnToCanvasRef.current || isCanvasModeRef.current;
    selectedImageReturnToCanvasRef.current = false;
    setSelectedImage(null);

    if (!shouldReturnToCanvas || !isCanvasModeRef.current) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (idleAutoCloseTimerRef.current) {
      clearTimeout(idleAutoCloseTimerRef.current);
      idleAutoCloseTimerRef.current = null;
    }
    startupAutoCloseSuppressedRef.current = false;
    isPointerInsideDrawerRef.current = true;
    setIsOpen(true);
    setIsPinned(true);
    isPinnedRef.current = true;
    setDrawerState('open');
    invoke('toggle_pin', { pinned: true }).catch(() => {});
    invoke('open_drawer', {
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).catch(() => {});
    window.requestAnimationFrame(() => {
      canvasSurfaceRef.current?.focus({ preventScroll: true });
    });
  };

  const isStartupOverlayActive = showLaunchIntro || isSplashVisible || showUpdateLog;

  const isDrawerActive =
    isOpen ||
    isPinned ||
    isStartupOverlayActive ||
    !!selectedImage ||
    !!selectedVideo;

  // 启动欢迎/更新日志期间只做一次确定的“侧边滑出”序列：
  // 1. 先把真实 Tauri 窗口打开到抽屉尺寸
  // 2. 前端从 pre_open 的侧边位置滑到 open
  // 3. 倒计时结束后，如果鼠标不在抽屉里，再缩回
  useLayoutEffect(() => {
    if (!isStartupOverlayActive || snipMode.active || isSnipSessionActive) return;

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (startupAutoCloseTimerRef.current) {
      clearTimeout(startupAutoCloseTimerRef.current);
      startupAutoCloseTimerRef.current = null;
    }

    setIsOpen(true);
    setDrawerState(prev => (prev === 'open' ? 'open' : 'pre_open'));

    invoke('open_drawer', {
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).catch(() => {});
    invoke('set_topmost', { topmost: true }).catch(() => {});

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDrawerState('open');
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [isStartupOverlayActive, snipMode.active, isSnipSessionActive]);

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const playSnipShutterSound = () => {
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      const audioStore = window as any;
      const ctx: AudioContext = audioStore.__drawerSnipAudioContext && audioStore.__drawerSnipAudioContext.state !== 'closed'
        ? audioStore.__drawerSnipAudioContext
        : new AudioContextCtor();
      audioStore.__drawerSnipAudioContext = ctx;

      const play = () => {
        const now = ctx.currentTime + 0.008;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.42, now + 0.012);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        master.connect(ctx.destination);

        const click = ctx.createOscillator();
        click.type = 'square';
        click.frequency.setValueAtTime(1100, now);
        click.frequency.exponentialRampToValueAtTime(330, now + 0.075);
        click.connect(master);
        click.start(now);
        click.stop(now + 0.1);

        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.09));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i += 1) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1400;
        noise.buffer = buffer;
        noise.connect(filter);
        filter.connect(master);
        noise.start(now + 0.035);
        noise.stop(now + 0.15);

        window.setTimeout(() => {
          try { master.disconnect(); } catch (_) {}
        }, 260);
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(play).catch(() => {});
      } else {
        play();
      }
    } catch (_) {}
  };

  const copyLocalImageToClipboard = async (path: string) => {
    const source = (path || '').trim();
    if (!source) throw new Error('empty screenshot path');

    const copyOnce = async () => {
      let pluginError: unknown = null;
      let browserError: unknown = null;
      let backendError: unknown = null;

      // 本地截图文件优先走后端复制。它不依赖 WebView 焦点/用户激活，
      // 比前端 Clipboard API 更适合截图结束后窗口切换的场景。
      try {
        await invoke('copy_image', { dataUrl: source });
        return;
      } catch (err) {
        backendError = err;
        console.warn('backend copy_image failed:', err);
      }

      // 兜底 1：Tauri clipboard-manager。之前直接把 Uint8Array 传给 writeImage，
      // 在 Tauri v2 下不够稳定；这里先转成 @tauri-apps/api/image 的 Image 对象。
      try {
        const response = await fetch(convertFileSrc(source));
        if (!response.ok) throw new Error(`读取截图文件失败: ${response.status}`);
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const image = await TauriImage.fromBytes(new Uint8Array(buffer));
        await writeImage(image);
        return;
      } catch (err) {
        pluginError = err;
        console.warn('clipboard-manager copy image failed:', err);
      }

      // 兜底 2：浏览器 ClipboardItem。部分 WebView2 环境允许这样写入 PNG。
      try {
        const ClipboardItemCtor = (window as any).ClipboardItem;
        if (!navigator.clipboard || !ClipboardItemCtor) throw new Error('ClipboardItem unavailable');
        const response = await fetch(convertFileSrc(source));
        if (!response.ok) throw new Error(`读取截图文件失败: ${response.status}`);
        const blob = await response.blob();
        const pngBlob = blob.type === 'image/png' ? blob : new Blob([await blob.arrayBuffer()], { type: 'image/png' });
        await navigator.clipboard.write([
          new ClipboardItemCtor({ 'image/png': pngBlob })
        ]);
        return;
      } catch (err) {
        browserError = err;
        console.warn('browser clipboard image copy failed:', err);
      }

      throw backendError || browserError || pluginError || new Error('copy image failed');
    };

    let lastError: unknown = null;
    for (let i = 0; i < 3; i += 1) {
      try {
        if (i > 0) await wait(120 + i * 120);
        await copyOnce();
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('copy image failed');
  };

  const applyWindowBounds = (width: number, height: number, anchor: 'left' | 'right' = 'right') => {
    pendingBoundsRef.current = { width, height, anchor };
    if (boundsFrameRef.current !== null) return;

    boundsFrameRef.current = requestAnimationFrame(() => {
      boundsFrameRef.current = null;
      const next = pendingBoundsRef.current;
      if (!next || snipMode.active || isSnipSessionActive) return;
      pendingBoundsRef.current = null;

      if (boundsInvokeInFlightRef.current) {
        pendingBoundsRef.current = next;
        boundsSyncRequestedRef.current = true;
        return;
      }

      const mainWidth = next.width > MIN_DRAWER_WIDTH + EDGE_WIDTH ? next.width - EDGE_WIDTH : next.width;
      boundsInvokeInFlightRef.current = true;
      invoke(next.anchor === 'left' ? 'resize_drawer_from_right' : 'resize_drawer', {
        width: clamp(mainWidth, MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH),
        height: clamp(next.height, MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT),
      }).catch(() => {}).finally(() => {
        boundsInvokeInFlightRef.current = false;
        if (boundsSyncRequestedRef.current) {
          boundsSyncRequestedRef.current = false;
          const latest = pendingBoundsRef.current;
          if (latest) applyWindowBounds(latest.width, latest.height, latest.anchor);
        }
      });
    });
  };

  useEffect(() => {
    return () => {
      if (boundsFrameRef.current !== null) {
        cancelAnimationFrame(boundsFrameRef.current);
        boundsFrameRef.current = null;
      }
    };
  }, []);

const startSnip = async () => {
  try {
    if (stateRef.current.isAntiTouchMode) {
      enforceAntiTouchClosed(true);
      return;
    }
    if (snipModeActiveRef.current || snipCaptureInFlightRef.current) return;
    snipModeActiveRef.current = true;
    isGlobalMouseDown.current = false;
    isDraggingTitleRef.current = false;
    setIsDraggingTitle(false);
    isResizingState.current = false;
    setIsSnipSessionActive(true);
    const shouldRestoreVisibleDrawer =
      (isOpen || isPinned || isCanvasMode) &&
      drawerState !== 'closed' &&
      drawerState !== 'closing';
    snipRestoreDrawerRef.current = {
      isOpen: shouldRestoreVisibleDrawer && isOpen,
      isPinned: shouldRestoreVisibleDrawer && (isPinned || isPinnedRef.current || isCanvasMode),
      isCanvasMode: shouldRestoreVisibleDrawer && isCanvasMode,
    };
    localStorage.setItem(
      SNIP_RESTORE_DRAWER_STORAGE_KEY,
      String(
        snipRestoreDrawerRef.current.isOpen ||
        snipRestoreDrawerRef.current.isPinned ||
        snipRestoreDrawerRef.current.isCanvasMode
      )
    );
    setSelection(null);
    setSnipMode({ active: false, bg: '' });

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (idleAutoCloseTimerRef.current) {
      clearTimeout(idleAutoCloseTimerRef.current);
      idleAutoCloseTimerRef.current = null;
    }
    const restore = snipRestoreDrawerRef.current;

    // 先同步隐藏抽屉内容，然后直接进入透明全屏截图层。
    // 不再预先 capture_screen + base64 渲染整屏图片，启动会比旧方案快很多。
    void restore;
    await invoke('show_snip_window');

    const prepareChrome = null;

    // 让 React 的透明遮罩先落到 DOM，再把 Tauri 主窗口切到全屏。
    void prepareChrome;
  } catch (err) {
    console.error('进入截图模式失败:', err);
    await invoke('hide_snip_window').catch(() => {});
    await invoke('set_drawer_pass_through', { ignore: false }).catch(() => {});
    const restore = snipRestoreDrawerRef.current;
    if (!restore?.isOpen && !restore?.isPinned && !restore?.isCanvasMode && !stateRef.current.isAntiTouchMode) {
      await invoke('show_edge', { height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});
    }
    await invoke('set_topmost', { topmost: true }).catch(() => {});
    snipModeActiveRef.current = false;
    setIsSnipSessionActive(false);
    snipRestoreDrawerRef.current = null;
    setSnipMode({ active: false, bg: '' });
    showToast('截图启动失败');
  }
};

  // 开合动画只响应“激活/关闭”变化，尺寸变化不再重新触发 pre_open -> open，避免缩放闪烁。
useEffect(() => {
  let cancelled = false;
  let timer: any = null;
  let frame: number | null = null;

  const run = async () => {
    if (snipMode.active || isSnipSessionActive || snipExitInFlightRef.current) return;

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (isDrawerActive) {
      // 启动欢迎页由专门的启动动画控制；这里不要再把状态重置成 pre_open。
      if (!isStartupOverlayActive) {
        setDrawerState(prev => (prev === 'open' ? 'open' : 'pre_open'));
      }

      await invoke('open_drawer', {
        width: drawerWidthRef.current,
        height: drawerHeightRef.current,
        mode: triggerModeRef.current,
      }).catch(() => {});
      await invoke('set_topmost', { topmost: true }).catch(() => {});

      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        if (!cancelled) setDrawerState('open');
      });
    } else {
      setDrawerState(prev => (prev === 'closed' ? 'closed' : 'closing'));

      timer = setTimeout(async () => {
        if (cancelled) return;
        await invoke('close_drawer', { mode: triggerModeRef.current }).catch(() => {});

        if (cancelled) return;
        setDrawerState('closed');
        await invoke('set_topmost', { topmost: true }).catch(() => {});
      }, DRAWER_ANIM_MS);
    }
  };

  run();

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    if (frame !== null) cancelAnimationFrame(frame);
  };
}, [isDrawerActive, snipMode.active, isSnipSessionActive]);

  // 兜底：只要前端状态已经是 closed，就再次把真实 Tauri 窗口压回 20px。
  // 这样即使上一轮动画/异步 resize 被打断，也不会留下一个透明的大命中框。
  useEffect(() => {
    if (snipMode.active || isSnipSessionActive || snipExitInFlightRef.current || isDrawerActive || drawerState !== 'closed') return;
    invoke('close_drawer', { mode: triggerModeRef.current }).catch(() => {});
  }, [drawerState, isDrawerActive, snipMode.active, isSnipSessionActive]);

  useEffect(() => {
    if (
      snipMode.active ||
      isSnipSessionActive ||
      snipExitInFlightRef.current ||
      isStartupOverlayActive ||
      isDrawerActive ||
      isAntiTouchMode
    ) return;

    const timers = [120, 700].map(delay => window.setTimeout(() => {
      invoke('show_edge', {
        height: drawerHeightRef.current,
        mode: triggerModeRef.current,
      }).catch(() => {});
    }, delay));

    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [
    drawerState,
    isStartupOverlayActive,
    isDrawerActive,
    isAntiTouchMode,
    triggerMode,
    snipMode.active,
    isSnipSessionActive,
  ]);

  // 尺寸变化只同步系统窗口大小，不重置抽屉动画状态。
useEffect(() => {
  if (snipMode.active || isSnipSessionActive || isResizingState.current || !isDrawerActive || drawerState === 'closed' || drawerState === 'closing') return;
  applyWindowBounds(drawerWidth + EDGE_WIDTH, drawerHeight, drawerResizeAnchorRef.current);
}, [drawerWidth, drawerHeight, isDrawerActive, drawerState, snipMode.active, isSnipSessionActive]);




  let transformX = '0px';
  let transitionStyle = 'none';

  if (drawerState === 'closed') {
      transformX = `${drawerWidth}px`;
      transitionStyle = 'none';
  } else if (drawerState === 'pre_open') {
      transformX = `${drawerWidth}px`;
      transitionStyle = 'none';
  } else if (drawerState === 'open') {
      transformX = '0px';
      transitionStyle = isResizingState.current ? 'none' : (isShortcutReveal ? 'transform 0.24s ease-out' : 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)');
  } else if (drawerState === 'closing') {
      transformX = `${drawerWidth}px`;
      transitionStyle = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
  }

  // 🌟 退出截图时，必须先把 Tauri 窗口恢复到抽屉尺寸，再卸载全屏截图层。
  // 否则 React 会先把抽屉内容显示在全屏窗口里，视觉上就像“先放大再缩小”。
  const exitSnip = async (reopen = false) => {
  snipExitInFlightRef.current = true;
  setSelection(null);
  isMouseDown.current = false;
  snipCaptureInFlightRef.current = false;

  // 保持 snipMode.active = true，让全屏截图层继续盖住内容。
  // 每一步都独立兜底，避免其中一个 IPC 失败后跳过恢复窗口/触发入口。
  await invoke('exit_snip_mode').catch((err) => {
    console.warn('exit_snip_mode failed:', err);
  });

  if (reopen) {
    if (stateRef.current.isAntiTouchMode) {
      flushSync(() => {
        setDrawerState('closed');
        setIsOpen(false);
        setIsPinned(false);
        setSnipMode({ active: false, bg: '' });
      });
      snipModeActiveRef.current = false;
      snipExitInFlightRef.current = false;
      enforceAntiTouchClosed(false);
      await invoke('set_topmost', { topmost: true }).catch(() => {});
      return;
    }

    await invoke('open_drawer', {
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).catch((err) => console.warn('open_drawer after snip failed:', err));

    flushSync(() => {
      setDrawerState('open');
      setIsOpen(true);
      setSnipMode({ active: false, bg: '' });
    });
    snipModeActiveRef.current = false;
    await appWindow.show().catch((err) => {
      console.warn('show main after snip failed:', err);
    });
    snipExitInFlightRef.current = false;
  } else {
    flushSync(() => {
      setDrawerState('closed');
      setIsOpen(false);
      setIsPinned(false);
      setSnipMode({ active: false, bg: '' });
    });
    snipModeActiveRef.current = false;

    await invoke('close_drawer', { mode: triggerModeRef.current }).catch(async (err) => {
      console.warn('close_drawer after snip failed:', err);
      await appWindow.hide().catch(() => {});
      await invoke('show_edge', { height: drawerHeightRef.current, mode: triggerModeRef.current }).catch((edgeErr) => {
        console.warn('show_edge after snip failed:', edgeErr);
      });
    });

    window.setTimeout(() => {
      snipExitInFlightRef.current = false;
    }, 180);
  }

  await invoke('set_topmost', { topmost: true }).catch(() => {});
};

  const revealDrawerAfterSnipCopy = async () => {
    if (stateRef.current.isAntiTouchMode) {
      enforceAntiTouchClosed(false);
      return;
    }

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    snipExitInFlightRef.current = false;
    markShortcutReveal();
    startupAutoCloseSuppressedRef.current = false;
    isPointerInsideDrawerRef.current = false;

    flushSync(() => {
      setActiveTab('image');
      setIsOpen(true);
      setDrawerState('pre_open');
    });
    await invoke('open_drawer', {
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).catch((err) => console.warn('open_drawer after snip copy failed:', err));
    setDrawerState('open');
    scheduleIdleAutoClose(3000);
    await invoke('set_topmost', { topmost: true }).catch(() => {});
  };

  const getSnipPlaceholderUrl = () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <rect width="640" height="360" rx="24" fill="#f5f5f4"/>
      <rect x="264" y="142" width="112" height="76" rx="16" fill="#e7e5e4"/>
      <circle cx="302" cy="174" r="13" fill="#a8a29e"/>
      <path d="M280 208l45-43 35 31 18-17 46 29H280z" fill="#a8a29e"/>
      <text x="320" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#78716c">截图处理中...</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const confirmSnip = async (pointer?: { screenX: number; screenY: number; clientX: number; clientY: number }) => {
    if (snipCaptureInFlightRef.current) return;
    const currentSelection = selection;
    if (!currentSelection || currentSelection.w < 10 || currentSelection.h < 10) return exitSnip();
    snipCaptureInFlightRef.current = true;
    playSnipShutterSound();

    const createdAt = Date.now();
    const placeholderId = `snip_${createdAt}_${Math.random().toString(36).substring(2, 7)}`;
    const placeholderItem: BufferItem = {
      id: placeholderId,
      type: 'image',
      content: '截图处理中...',
      name: `截图_${createdAt}.png`,
      url: getSnipPlaceholderUrl(),
      createdAt,
      folderId: activeFolderId !== 'all' ? activeFolderId : undefined,
    };

    const noteX = pointer
      ? pointer.screenX - (pointer.clientX - currentSelection.x)
      : currentSelection.x;
    const noteY = pointer
      ? pointer.screenY - (pointer.clientY - currentSelection.y)
      : currentSelection.y;
    let snipNoteTarget: { noteLabel: string; snapshot: FloatingNoteSnapshot } | null | undefined = null;
    let snipNotePromise: Promise<{ noteLabel: string; snapshot: FloatingNoteSnapshot } | null | undefined> | null = null;

    const openSnipNoteOnce = (item: BufferItem = placeholderItem) => {
      if (!snipNotePromise) {
        snipNotePromise = createFloatingNote(item, {
          topmost: true,
          x: Math.round(noteX),
          y: Math.round(noteY),
          width: Math.round(currentSelection.w),
          height: Math.round(currentSelection.h),
          silent: true,
        }).then((target) => {
          snipNoteTarget = target;
          return target;
        });
      }
      return snipNotePromise;
    };

    const updateSnipNote = async (target: { noteLabel: string; snapshot: FloatingNoteSnapshot } | null | undefined, item: BufferItem) => {
      if (!target) return;
      const latestSnapshot = readFloatingNoteSnapshot(target.noteLabel) || target.snapshot;
      const next: FloatingNoteSnapshot = {
        ...latestSnapshot,
        name: item.name,
        content: item.content,
        path: item.path,
        url: item.url,
        thumbnail: item.thumbnail,
        updatedAt: Date.now(),
      };
      snipNoteTarget = { ...target, snapshot: next };
      localStorage.setItem(floatingNoteStorageKey(target.noteLabel), JSON.stringify(next));
      await emitFloatingNoteUpdated(target.noteLabel, next).catch(() => {});
      refreshNoteManager();
    };

    // 先把占位卡片放进抽屉；截图窗口仍然盖着，所以不会被截进去。
    // Rust 捕获到像素后会发 snip-area-captured，前端立即恢复抽屉，
    // 后续 PNG 保存/IPC 返回完成后再把占位图替换成真实截图。
    pushDrawerUndoSnapshot('截图');
    setItems(prev => [placeholderItem, ...prev]);
    setActiveTab('image');

    let restorePromise: Promise<void> | null = null;
    let unlistenCaptured: (() => void) | undefined;
    let restoreTimer: number | null = null;
    let captureTimeout: number | null = null;

    const restoreDrawerOnce = () => {
      if (restorePromise) return restorePromise;
      if (restoreTimer !== null) {
        window.clearTimeout(restoreTimer);
        restoreTimer = null;
      }
      restorePromise = exitSnip(false).catch((err) => {
        console.warn('exit snip after capture failed:', err);
      });
      return restorePromise;
    };

    try {
      unlistenCaptured = await listen('snip-area-captured', () => {
        void openSnipNoteOnce();
        void restoreDrawerOnce();
      });

      restoreTimer = window.setTimeout(() => {
        void restoreDrawerOnce();
      }, 900);

      const capturePromise = invoke<string>('capture_screen_area_to_file', {
        x: Math.round(currentSelection.x),
        y: Math.round(currentSelection.y),
        width: Math.round(currentSelection.w),
        height: Math.round(currentSelection.h),
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        captureTimeout = window.setTimeout(() => reject(new Error('截图保存超时')), 10_000);
      });
      const savedPath = await Promise.race([capturePromise, timeoutPromise]);
      if (captureTimeout !== null) {
        window.clearTimeout(captureTimeout);
        captureTimeout = null;
      }

      if (unlistenCaptured) {
        unlistenCaptured();
        unlistenCaptured = undefined;
      }

      await restoreDrawerOnce();

      const assetUrl = convertFileSrc(savedPath);
      const finalItem = {
        ...placeholderItem,
        content: '截图内容',
        name: `截图_${createdAt}.png`,
        url: assetUrl,
        path: savedPath,
      } as BufferItem;
      const clipboardPromise = copyLocalImageToClipboard(savedPath)
        .then(() => ({ copied: true, error: null as unknown }))
        .catch((err) => {
          console.warn('截图复制到剪贴板失败:', err);
          return { copied: false, error: err as unknown };
        });

      setItems(prev => prev.map(item => item.id === placeholderId ? {
        ...item,
        ...finalItem,
      } : item));
      const target = snipNoteTarget || (snipNotePromise ? await snipNotePromise : await openSnipNoteOnce(finalItem));
      await updateSnipNote(target, finalItem);
      await revealDrawerAfterSnipCopy();

      const clipboardResult = await clipboardPromise;
      if (clipboardResult.copied) {
        showToast('截图成功，已复制并置顶为便签');
      } else {
        console.warn('截图复制失败详情:', clipboardResult.error);
        showToast('截图成功，已置顶为便签，自动复制失败');
      }
    } catch (err) {
      if (captureTimeout !== null) window.clearTimeout(captureTimeout);
      if (restoreTimer !== null) window.clearTimeout(restoreTimer);
      if (unlistenCaptured) unlistenCaptured();
      let target = snipNoteTarget;
      if (!target && snipNotePromise) {
        try {
          target = await snipNotePromise;
        } catch (_) {
          target = null;
        }
      }
      const targetLabel = (target as any)?.noteLabel as string | undefined;
      if (targetLabel) {
        deleteFloatingNoteSnapshot(targetLabel);
        forgetOpenFloatingNoteLabel(targetLabel);
        await invoke('hide_note_window', { label: targetLabel }).catch(() => {});
        refreshNoteManager();
      }
      console.error('截图选区捕获失败:', err);
      setItems(prev => prev.filter(item => item.id !== placeholderId));
      showToast('截图失败');
      await exitSnip(false);
    } finally {
      snipCaptureInFlightRef.current = false;
    }
  };

  const finishSnipWindowSession = async (_restoreTrigger = false) => {
    const restore = snipRestoreDrawerRef.current;
    await invoke('hide_snip_window').catch(() => {});
    await invoke('set_drawer_pass_through', { ignore: false }).catch(() => {});
    isGlobalMouseDown.current = false;
    isDraggingTitleRef.current = false;
    isResizingState.current = false;
    setIsDraggingTitle(false);
    document.body.style.cursor = '';
    snipModeActiveRef.current = false;
    setIsSnipSessionActive(false);
    snipExitInFlightRef.current = false;
    snipRestoreDrawerRef.current = null;
    setSelection(null);
    setSnipMode({ active: false, bg: '' });
    const shouldRestoreDrawer = !!(restore?.isOpen || restore?.isPinned || restore?.isCanvasMode);
    if (shouldRestoreDrawer && !stateRef.current.isAntiTouchMode) {
      flushSync(() => {
        setIsOpen(true);
        setIsPinned(!!(restore?.isPinned || restore?.isCanvasMode));
        setDrawerState('pre_open');
      });
      await invoke('open_drawer', {
        width: drawerWidthRef.current,
        height: drawerHeightRef.current,
        mode: triggerModeRef.current,
      }).then(() => {
        setDrawerState('open');
      }).catch(async (err) => {
        console.warn('restore drawer after snip window failed:', err);
        await invoke('show_edge', { height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});
      });
    } else {
      flushSync(() => {
        setIsOpen(false);
        setIsPinned(false);
        setDrawerState('closed');
      });
      if (stateRef.current.isAntiTouchMode) {
        enforceAntiTouchClosed(false);
      } else {
        await invoke('show_edge', { height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});
      }
    }
    await invoke('set_topmost', { topmost: true }).catch(() => {});
  };

  const resetSnipSessionState = () => {
    snipModeActiveRef.current = false;
    snipCaptureInFlightRef.current = false;
    snipExitInFlightRef.current = false;
    snipRestoreDrawerRef.current = null;
    isGlobalMouseDown.current = false;
    isDraggingTitleRef.current = false;
    isResizingState.current = false;
    setIsSnipSessionActive(false);
    setIsDraggingTitle(false);
    setSelection(null);
    setSnipMode({ active: false, bg: '' });
    document.body.style.cursor = '';
  };

  const handleSnipWindowCaptured = async (payload: any) => {
    const savedPath = typeof payload?.path === 'string' ? payload.path : '';
    if (!savedPath) {
      showToast('截图失败');
      await finishSnipWindowSession(true);
      return;
    }
    const snipLockKey = `${SNIP_CAPTURE_LOCK_STORAGE_KEY}_${localLockKeyPart(savedPath)}`;
    const snipLockOwner = acquireTimedLocalLock(snipLockKey, 10_000);
    if (!snipLockOwner) return;

    const now = Date.now();
    handledSnipPathsRef.current.forEach((timestamp, path) => {
      if (now - timestamp > 30_000) handledSnipPathsRef.current.delete(path);
    });
    if (handledSnipPathsRef.current.has(savedPath) || snipCaptureInFlightRef.current) return;
    handledSnipPathsRef.current.set(savedPath, now);
    snipCaptureInFlightRef.current = true;
    try {
    playSnipShutterSound();
    resetSnipSessionState();
    snipCaptureInFlightRef.current = true;

    const createdAt = Date.now();
    const width = Number(payload?.width) || 320;
    const height = Number(payload?.height) || 220;
    const finalItem = {
      id: `snip_${createdAt}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'image',
      content: '截图内容',
      name: `截图_${createdAt}.png`,
      url: convertFileSrc(savedPath),
      path: savedPath,
      createdAt,
      folderId: activeFolderIdRef.current !== 'all' ? activeFolderIdRef.current : undefined,
    } as BufferItem;

    const copyScreenshotToClipboard = () => copyLocalImageToClipboard(savedPath)
      .then(() => ({ copied: true, error: null as unknown }))
      .catch((err) => {
        console.warn('截图复制到剪贴板失败:', err);
        return { copied: false, error: err as unknown };
      });

    setActiveTab('image');
    pushDrawerUndoSnapshot('截图');
    setItems(prev => [finalItem, ...prev]);
    if (isCanvasModeRef.current) {
      const canvasItem = await createCanvasImageItemFromPath(savedPath, 0);
      if (canvasItem) addCanvasImageItems([canvasItem]);
    } else {
      await createFloatingNote(finalItem, {
        topmost: true,
        x: Math.round(Number(payload?.noteX) || Number(payload?.x) || 0),
        y: Math.round(Number(payload?.noteY) || Number(payload?.y) || 0),
        width: Math.round(width),
        height: Math.round(height),
        silent: true,
      });
    }

    void copyScreenshotToClipboard().then((clipboardResult) => {
    if (clipboardResult.copied) {
      showToast(isCanvasModeRef.current ? '截图成功，已复制并加入画布' : '截图成功，已复制并置顶为便签');
    } else {
      console.warn('截图复制失败详情:', clipboardResult.error);
      showToast(isCanvasModeRef.current ? '截图成功，已加入画布，自动复制失败' : '截图成功，已置顶为便签，自动复制失败');
    }
    });
    } catch (err) {
      console.error('snip window capture handling failed:', err);
      showToast('截图失败');
      await finishSnipWindowSession(true);
    } finally {
      snipCaptureInFlightRef.current = false;
      snipModeActiveRef.current = false;
      snipExitInFlightRef.current = false;
      isGlobalMouseDown.current = false;
      isDraggingTitleRef.current = false;
      isResizingState.current = false;
      setIsSnipSessionActive(false);
      setIsDraggingTitle(false);
      document.body.style.cursor = '';
    }
  };

  const recoverSnipWindowFromMain = async (restoreDrawer: boolean) => {
    await invoke('recover_after_snip', {
      restoreDrawer,
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).catch(async (err) => {
      console.warn('recover after snip selection failed:', err);
      await invoke('hide_snip_window').catch(() => {});
      await invoke('set_drawer_pass_through', { ignore: false }).catch(() => {});
      await invoke('set_topmost', { topmost: true }).catch(() => {});
    });
  };

  const handleSnipSelection = async (payload: any) => {
    if (snipCaptureInFlightRef.current) return;
    snipCaptureInFlightRef.current = true;
    const restore = snipRestoreDrawerRef.current;
    const restoreDrawer = !!(restore?.isOpen || restore?.isPinned || restore?.isCanvasMode);

    try {
      const savedPath = await invoke<string>('capture_snip_window_selection_to_file', {
        x: Number(payload?.x) || 0,
        y: Number(payload?.y) || 0,
        width: Number(payload?.width) || 1,
        height: Number(payload?.height) || 1,
        viewportWidth: Number(payload?.viewportWidth) || 1,
        viewportHeight: Number(payload?.viewportHeight) || 1,
      });
      await recoverSnipWindowFromMain(restoreDrawer);
      snipCaptureInFlightRef.current = false;
      await handleSnipWindowCaptured({ ...payload, path: savedPath });
    } catch (err) {
      console.error('snip selection capture failed:', err);
      await recoverSnipWindowFromMain(restoreDrawer);
      resetSnipSessionState();
      showToast('截图失败');
    } finally {
      snipCaptureInFlightRef.current = false;
    }
  };

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let disposed = false;
    const addSnipListener = (listener: Promise<() => void>) => {
      listener.then(unlisten => {
        if (disposed) {
          unlisten();
        } else {
          unlisteners.push(unlisten);
        }
      }).catch(console.warn);
    };
    addSnipListener(listen('snip-selection', (event: any) => {
      void handleSnipSelection(event.payload);
    }));
    addSnipListener(listen('snip-captured', (event: any) => {
      void handleSnipWindowCaptured(event.payload);
    }));
    addSnipListener(listen('snip-cancelled', () => {
      void finishSnipWindowSession(true);
    }));
    addSnipListener(listen('snip-failed', (event: any) => {
      console.warn('snip window capture failed:', event.payload);
      showToast('截图失败');
      void finishSnipWindowSession(true);
    }));
    addSnipListener(listen('snip-recovered', () => {
      resetSnipSessionState();
    }));
    return () => {
      disposed = true;
      unlisteners.splice(0).forEach(unlisten => unlisten());
    };
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && snipMode.active) exitSnip(); };
    window.addEventListener('keydown', handleEsc);
    return () => { window.removeEventListener('keydown', handleEsc); };
  }, [snipMode.active]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedImage) closeSelectedImagePreview();
    };
    window.addEventListener('keydown', handleEsc);
    return () => { window.removeEventListener('keydown', handleEsc); };
  }, [selectedImage]);

  const handleTogglePin = () => {
    if (isPinned) {
      // 复位：取消钉住，并让抽屉按当前动画缩回；关闭完成后 edge 会自动回到最右侧。
      setIsPinned(false);
      isPinnedRef.current = false;
      isPointerInsideDrawerRef.current = false;
      setIsOpen(false);
      invoke('set_topmost', { topmost: true }).catch(() => {});
    } else {
      setIsPinned(true);
      isPinnedRef.current = true;
      setIsOpen(true);
      setDrawerState('open');
      invoke('toggle_pin', { pinned: true }).catch(()=>{});
    }
  };


  const finishResize = (anchor: 'left' | 'right' = 'right') => {
    const nextWidth = clamp(drawerWidthRef.current, MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH);
    const nextHeight = clamp(drawerHeightRef.current, MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT);
    drawerWidthRef.current = nextWidth;
    drawerHeightRef.current = nextHeight;
    drawerResizeAnchorRef.current = anchor;

    isResizingState.current = false;
    isGlobalMouseDown.current = false;
    setDrawerWidth(nextWidth);
    setDrawerHeight(nextHeight);
    applyWindowBounds(nextWidth + EDGE_WIDTH, nextHeight, anchor);
    invoke('set_topmost', { topmost: true }).catch(() => {});

    if (!isPointerInsideDrawerRef.current && !shouldBlockAutoClose()) {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => setIsOpen(false), 180);
    }
  };

  const startResizingWidth = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingState.current = true;
    isGlobalMouseDown.current = true;
    setIsOpen(true);
    setDrawerState('open');

    const startX = e.screenX;
    const startWidth = drawerWidthRef.current;
    const startHeight = drawerHeightRef.current;

    const onMove = (me: PointerEvent) => {
      const nextWidth = clamp(startWidth - (me.screenX - startX), MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH);
      drawerWidthRef.current = nextWidth;
      applyWindowBounds(nextWidth + EDGE_WIDTH, startHeight);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      finishResize();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', cleanup);
    document.addEventListener('pointercancel', cleanup);
  };

  const startResizingHeight = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingState.current = true;
    isGlobalMouseDown.current = true;
    setIsOpen(true);
    setDrawerState('open');

    const startY = e.screenY;
    const startHeight = drawerHeightRef.current;
    const startWidth = drawerWidthRef.current;

    const onMove = (me: PointerEvent) => {
      const nextHeight = clamp(startHeight + (me.screenY - startY), MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT);
      drawerHeightRef.current = nextHeight;
      applyWindowBounds(startWidth + EDGE_WIDTH, nextHeight);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      finishResize();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', cleanup);
    document.addEventListener('pointercancel', cleanup);
  };

  const startResizingCorner = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingState.current = true;
    isGlobalMouseDown.current = true;
    setIsOpen(true);
    setDrawerState('open');

    const startX = e.screenX;
    const startY = e.screenY;
    const startWidth = drawerWidthRef.current;
    const startHeight = drawerHeightRef.current;

    const onMove = (me: PointerEvent) => {
      const nextWidth = clamp(startWidth - (me.screenX - startX), MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH);
      const nextHeight = clamp(startHeight + (me.screenY - startY), MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT);
      drawerWidthRef.current = nextWidth;
      drawerHeightRef.current = nextHeight;
      applyWindowBounds(nextWidth + EDGE_WIDTH, nextHeight);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      finishResize();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', cleanup);
    document.addEventListener('pointercancel', cleanup);
  };

  const startResizingRightCorner = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingState.current = true;
    isGlobalMouseDown.current = true;
    setIsOpen(true);
    setDrawerState('open');

    const startX = e.screenX;
    const startY = e.screenY;
    const startWidth = drawerWidthRef.current;
    const startHeight = drawerHeightRef.current;

    const onMove = (me: PointerEvent) => {
      const nextWidth = clamp(startWidth + (me.screenX - startX), MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH);
      const nextHeight = clamp(startHeight + (me.screenY - startY), MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT);
      drawerWidthRef.current = nextWidth;
      drawerHeightRef.current = nextHeight;
      applyWindowBounds(nextWidth + EDGE_WIDTH, nextHeight, 'left');
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      finishResize('left');
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', cleanup);
    document.addEventListener('pointercancel', cleanup);
  };

  const handleRecordShortcut = (e: React.KeyboardEvent, setter: Function, submitterName: string) => {
    e.preventDefault(); e.stopPropagation();
    const key = e.key; if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;
    const keys: string[] = [];
    if (e.ctrlKey) keys.push('Ctrl'); if (e.altKey) keys.push('Alt'); if (e.shiftKey) keys.push('Shift');
    if (e.metaKey) keys.push('Command');
    let k = key.toUpperCase(); if (k === ' ') k = 'Space'; else if (k === 'ESCAPE') k = 'Esc'; else if (k.startsWith('ARROW')) k = k.replace('ARROW', '');
    keys.push(k); const newShortcut = keys.join('+'); setter(newShortcut);
    if (submitterName === 'update-trigger-shortcut') localStorage.setItem('drawer_trigger_shortcut', newShortcut);
    invoke('update_shortcut', { name: submitterName.replace(/-/g, '_'), shortcut: newShortcut }).catch(()=>{});
  };

  const createTextOrUrlItem = (rawText: string, defaultName = '文本片段'): BufferItem => {
    const text = rawText.trim();
    const base = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'text' as const,
      content: text,
      createdAt: Date.now(),
      folderId: activeFolderId !== 'all' ? activeFolderId : undefined,
    };

    if (isProbablyUrl(text)) {
      return {
        ...base,
        name: '网址链接',
        url: text,
        path: text,
        isUrl: true,
      } as BufferItem & { isUrl?: boolean };
    }

    return { ...base, name: defaultName };
  };

  useEffect(() => {
    const handlePaste = (e: any) => {
      if (showTextInput || showFolderModal || isSearchActive || isTextEntryActive()) return;
      const clipboardItems = e.clipboardData?.items; if (!clipboardItems) return;
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.startsWith('image/')) {
          const file = clipboardItems[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const url = ev.target?.result as string;
              const newItem = { id: Math.random().toString(36).substring(2, 9), type: 'image', content: '图片', name: `粘贴图 ${new Date().toLocaleTimeString()}.png`, url, createdAt: Date.now(), folderId: activeFolderId !== 'all' ? activeFolderId : undefined } as BufferItem;
              pushDrawerUndoSnapshot('粘贴图片');
              setItems(prev => [newItem, ...prev]);
              triggerAutoPaletteForItems([newItem]);
              setActiveTab('image'); setIsOpen(true);
            };
            reader.readAsDataURL(file);
          }
        } else if (clipboardItems[i].type === 'text/plain') {
          clipboardItems[i].getAsString((text: string) => {
            if (text.trim()) {
              pushDrawerUndoSnapshot('粘贴文本');
              setItems(prev => [createTextOrUrlItem(text, '文本片段'), ...prev]);
              setActiveTab('text'); setIsOpen(true);
            }
          });
        }
      }
    };
    window.addEventListener('paste', handlePaste); return () => window.removeEventListener('paste', handlePaste);
  }, [showTextInput, isSearchActive, showFolderModal, activeFolderId]);



  const finishLaunchIntro = (manualOrEvent?: boolean | React.MouseEvent, acceptDisclaimer = true) => {
    const manual = manualOrEvent === true || (typeof manualOrEvent === 'object' && !!manualOrEvent);
    if (acceptDisclaimer) acceptCloudflaredDisclaimer();
    else declineCloudflaredDisclaimer();

    markLaunchIntroDoneThisPage();
    startupAutoCloseSuppressedRef.current = true;
    if (startupAutoCloseTimerRef.current) {
      clearTimeout(startupAutoCloseTimerRef.current);
      startupAutoCloseTimerRef.current = null;
    }

    showLaunchIntroRef.current = false;
    isSplashVisibleRef.current = false;

    // 启动临时钉住到这里结束，同时解除后端启动锁。
    invoke('set_startup_close_lock', { ms: 0 }).catch(() => {});
    setIsPinned(false);
    isPinnedRef.current = false;
    invoke('toggle_pin', { pinned: false }).catch(() => {});

    flushSync(() => {
      setShowLaunchIntro(false);
      setIsSplashVisible(false);
      setIsPinned(false);
      setIsOpen(true);
      setDrawerState('open');
    });

    invoke('set_topmost', { topmost: true }).catch(() => {});

    if (manual) {
      isPointerInsideDrawerRef.current = true;
    }
  };

  useLayoutEffect(() => {
    if (!showLaunchIntro) {
      setIsSplashVisible(false);
      isSplashVisibleRef.current = false;
      return;
    }

    // 不要在这里标记启动动画完成；React StrictMode / Tauri dev 会重挂载，
    // 提前写入会让第二次挂载误以为动画已完成，启动瞬间就缩回。
    startupAutoCloseSuppressedRef.current = true;
    isPointerInsideDrawerRef.current = false;
    setIsSplashVisible(true);
    isSplashVisibleRef.current = true;

    // 后端启动锁：启动欢迎页期间即使有旧的 close_drawer / drawer-closed，
    // Rust 层也直接忽略，避免主窗口被真实隐藏。
    invoke('set_startup_close_lock', { ms: STARTUP_CONSENT_DELAY_MS + 1000 }).catch(() => {});

    // 启动欢迎页期间临时钉住，避免任何自动关闭事件把抽屉收回。
    // 倒计时结束或用户手动跳过时，再在 finishLaunchIntro 里恢复普通打开态。
    setIsPinned(true);
    isPinnedRef.current = true;
    invoke('toggle_pin', { pinned: true }).catch(() => {});

    setIsOpen(true);
    setDrawerState('pre_open');

    // main 自己负责启动时打开真实抽屉窗口，不再依赖 edge 的旧启动预览。
    invoke('open_drawer', {
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).catch(() => {});
    invoke('set_topmost', { topmost: true }).catch(() => {});

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setDrawerState('open'));
    });

    const timer = window.setTimeout(() => finishLaunchIntro(false, true), STARTUP_CONSENT_DELAY_MS);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [showLaunchIntro]);

  const isTextEntryActive = () => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) return false;
    const tag = element.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable || !!element.closest('[data-canvas-edit-control="true"]');
  };

  const blurCanvasActiveTextEntry = (nextTarget?: EventTarget | null) => {
    if (!isCanvasModeRef.current) return false;
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return false;
    const tag = element.tagName;
    const isEditable = tag === 'INPUT'
      || tag === 'TEXTAREA'
      || tag === 'SELECT'
      || element.isContentEditable
      || !!element.closest('[data-canvas-edit-control="true"]');
    if (!isEditable || typeof element.blur !== 'function') return false;
    const nextNode = nextTarget instanceof Node ? nextTarget : null;
    if (nextNode && (element === nextNode || element.contains(nextNode))) return false;
    element.blur();
    return true;
  };

  const stopCanvasEditEvent = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const runCanvasAiNodeFromControl = (targetId: string) => {
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || target.ai?.status === 'working') return;
    if (target.ai?.type === 'workflow') {
      void generateCanvasWorkflowModuleNode(targetId);
      return;
    }
    if (isCanvasAiGeneratorType(target.ai?.type)) {
      void generateCanvasAiGeneratorNode(targetId);
    }
  };

  const handleCanvasAiRunPointerDown = (event: React.PointerEvent<HTMLButtonElement>, targetId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.disabled) return;
    canvasRunButtonPointerRef.current = {
      targetId,
      at: window.performance.now(),
    };
    runCanvasAiNodeFromControl(targetId);
  };

  const handleCanvasAiRunClick = (event: React.MouseEvent<HTMLButtonElement>, targetId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const pointerRun = canvasRunButtonPointerRef.current;
    if (pointerRun?.targetId === targetId && window.performance.now() - pointerRun.at < 5000) {
      canvasRunButtonPointerRef.current = null;
      return;
    }
    canvasRunButtonPointerRef.current = null;
    if (event.currentTarget.disabled) return;
    runCanvasAiNodeFromControl(targetId);
  };

  useEffect(() => {
    if (!isCanvasMode) return;
    const handleCanvasPointerDownForBlur = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-canvas-run-control="true"]')) return;
      blurCanvasActiveTextEntry(event.target);
    };
    document.addEventListener('pointerdown', handleCanvasPointerDownForBlur, true);
    return () => {
      document.removeEventListener('pointerdown', handleCanvasPointerDownForBlur, true);
    };
  }, [isCanvasMode]);

  useEffect(() => {
    const handleDrawerUndoKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.shiftKey || event.altKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      if (!isDrawerActive || isTextEntryActive()) return;

      event.preventDefault();
      event.stopPropagation();
      if (isCanvasModeRef.current && undoLastCanvasChange()) return;
      undoLastDrawerChange();
    };

    window.addEventListener('keydown', handleDrawerUndoKeyDown, true);
    document.addEventListener('keydown', handleDrawerUndoKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleDrawerUndoKeyDown, true);
      document.removeEventListener('keydown', handleDrawerUndoKeyDown, true);
    };
  }, [isDrawerActive]);

  useEffect(() => {
    const handleShiftToSelect = (event: KeyboardEvent) => {
      if (event.key !== 'Shift' || event.repeat) return;
      if (
        !isDrawerActive ||
        isSelectMode ||
        isUtilityActiveTab ||
        displayItems.length === 0 ||
        showSettings ||
        showTextInput ||
        showFolderModal ||
        showMoveFolderModal ||
        isSearchActive ||
        confirmDialog.isOpen ||
        !!selectedImage ||
        !!selectedVideo ||
        snipMode.active ||
        isSnipSessionActive ||
        isTextEntryActive()
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsSelectMode(true);
      lastSelectedDrawerItemIdRef.current = null;
    };

    window.addEventListener('keydown', handleShiftToSelect, true);
    return () => window.removeEventListener('keydown', handleShiftToSelect, true);
  }, [
    isDrawerActive,
    isSelectMode,
    isUtilityActiveTab,
    displayItems.length,
    showSettings,
    showTextInput,
    showFolderModal,
    showMoveFolderModal,
    isSearchActive,
    confirmDialog.isOpen,
    selectedImage,
    selectedVideo,
    snipMode.active,
    isSnipSessionActive,
  ]);

  useEffect(() => {
    if (!canvasWorkflowSaveDraft) return;
    const handleCanvasWorkflowSaveKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeCanvasWorkflowSaveDialog();
    };
    window.addEventListener('keydown', handleCanvasWorkflowSaveKeyDown, true);
    return () => window.removeEventListener('keydown', handleCanvasWorkflowSaveKeyDown, true);
  }, [canvasWorkflowSaveDraft]);

  const shouldBlockAutoClose = () => (
    // 只保留真正需要阻止自动缩回的情况：
    // 1. 用户手动点了钉住；2. 正在预览图片/视频；3. 正在拖动/缩放这类瞬时操作。
    // 设置、搜索、文本输入、二维码、弹窗等面板不再阻止自动缩回；鼠标是否在抽屉内由 scheduleAutoClose 单独判断。
    isDraggingTitleRef.current ||
    startupAutoCloseSuppressedRef.current ||
    isGlobalMouseDown.current ||
    isResizingState.current ||
    isDraggingOver ||
    isPinned ||
    !!selectedImage ||
    !!selectedVideo ||
    isTextEntryActive() ||
    showTextInput ||
    showFolderModal ||
    isSearchActive ||
    editingFolderId !== null ||
    confirmDialog.isOpen ||
    showLaunchIntro ||
    isSplashVisible ||
    showUpdateLog
  );

  const shouldBlockIdleAutoClose = () => (
    isDraggingTitleRef.current ||
    startupAutoCloseSuppressedRef.current ||
    isGlobalMouseDown.current ||
    isResizingState.current ||
    isDraggingOver ||
    isPinned ||
    !!selectedImage ||
    !!selectedVideo ||
    isTextEntryActive() ||
    showTextInput ||
    editingFolderId !== null ||
    confirmDialog.isOpen ||
    showLaunchIntro ||
    isSplashVisible ||
    showUpdateLog ||
    snipMode.active ||
    isSnipSessionActive
  );

  const clearIdleAutoClose = () => {
    if (idleAutoCloseTimerRef.current) {
      clearTimeout(idleAutoCloseTimerRef.current);
      idleAutoCloseTimerRef.current = null;
    }
  };

  const scheduleIdleAutoClose = (delay = 3000) => {
    clearIdleAutoClose();
    if (!isDrawerActive || drawerState !== 'open' || isPointerInsideDrawerRef.current || shouldBlockIdleAutoClose()) return;
    idleAutoCloseTimerRef.current = setTimeout(() => {
      idleAutoCloseTimerRef.current = null;
      if (!isPointerInsideDrawerRef.current && !shouldBlockIdleAutoClose()) {
        setIsOpen(false);
        setIsPinned(false);
      }
    }, delay);
  };

  const scheduleAutoClose = (delay = 180) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    clearIdleAutoClose();
    closeTimerRef.current = setTimeout(() => {
      if (!isPointerInsideDrawerRef.current && !shouldBlockAutoClose()) {
        setIsOpen(false);
      }
    }, delay);
  };

  const keepDrawerOpenByPointer = () => {
    startupAutoCloseSuppressedRef.current = false;
    isPointerInsideDrawerRef.current = true;
    clearIdleAutoClose();
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleFloatingLayerPointerLeave = (e: React.PointerEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    isPointerInsideDrawerRef.current = false;
    if (drawerState === 'open' && !shouldBlockAutoClose()) scheduleAutoClose(180);
    else scheduleIdleAutoClose(3000);
  };

  useEffect(() => {
    let disposed = false;
    let unlistenFocusChanged: (() => void) | undefined;
    let closeFrame: number | null = null;

    const closeUnpinnedDrawerFromOutside = () => {
      if (closeFrame !== null) cancelAnimationFrame(closeFrame);
      closeFrame = requestAnimationFrame(() => {
        closeFrame = null;
        void (async () => {
          let pointerInsideForClose = isPointerInsideDrawerRef.current;
          if (isSelectMode && pointerInsideForClose) {
            try {
              const [cursor, position, size] = await Promise.all([
                cursorPosition(),
                appWindow.outerPosition(),
                appWindow.outerSize(),
              ]);
              pointerInsideForClose =
                cursor.x >= position.x &&
                cursor.y >= position.y &&
                cursor.x <= position.x + size.width &&
                cursor.y <= position.y + size.height;
            } catch (_) {}
          }

          const wasInternalInteraction = Date.now() - lastDrawerPointerDownAtRef.current < 500 && pointerInsideForClose;
          if (
            !isOpen ||
            isPinnedRef.current ||
            pointerInsideForClose ||
            wasInternalInteraction ||
            drawerState === 'closed' ||
            drawerState === 'closing' ||
            snipModeActiveRef.current ||
            snipExitInFlightRef.current ||
            isSnipSessionActive ||
            isDraggingTitleRef.current ||
            isResizingState.current ||
            isDraggingOver ||
            showLaunchIntroRef.current ||
            isSplashVisibleRef.current ||
            showUpdateLogRef.current
          ) {
            return;
          }

          isPointerInsideDrawerRef.current = false;
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
          clearIdleAutoClose();
          setIsOpen(false);
          setIsPinned(false);
          setIsSelectMode(false);
          setSelectedIds([]);
          lastSelectedDrawerItemIdRef.current = null;
          isPinnedRef.current = false;
          invoke('toggle_pin', { pinned: false }).catch(() => {});
        })();
      });
    };

    const handleWindowBlur = () => closeUnpinnedDrawerFromOutside();

    window.addEventListener('blur', handleWindowBlur, true);
    appWindow.onFocusChanged((event) => {
      if (!event.payload) closeUnpinnedDrawerFromOutside();
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenFocusChanged = unlisten;
    }).catch(() => {});

    return () => {
      disposed = true;
      if (closeFrame !== null) cancelAnimationFrame(closeFrame);
      window.removeEventListener('blur', handleWindowBlur, true);
      if (unlistenFocusChanged) unlistenFocusChanged();
    };
  }, [
    isOpen,
    drawerState,
    isSelectMode,
    isSnipSessionActive,
    isDraggingOver,
  ]);

  useEffect(() => {
    if (
      !isDrawerActive ||
      drawerState !== 'open' ||
      isPointerInsideDrawerRef.current ||
      shouldBlockIdleAutoClose()
    ) {
      clearIdleAutoClose();
      return;
    }

    scheduleIdleAutoClose(3000);
    return clearIdleAutoClose;
  }, [
    isDrawerActive,
    drawerState,
    isPinned,
    selectedImage,
    selectedVideo,
    showTextInput,
    showFolderModal,
    isSearchActive,
    editingFolderId,
    confirmDialog.isOpen,
    showLaunchIntro,
    isSplashVisible,
    showUpdateLog,
    snipMode.active,
    isSnipSessionActive,
    isDraggingOver,
  ]);

  useEffect(() => {
    const handleFocusIn = () => {
      if (isPointerInsideDrawerRef.current) return;
      clearIdleAutoClose();
    };
    const handleFocusOut = () => {
      window.setTimeout(() => {
        if (!isPointerInsideDrawerRef.current) scheduleIdleAutoClose(3000);
      }, 0);
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
    };
  }, [isDrawerActive, drawerState, isPinned, showTextInput, editingFolderId, showLaunchIntro, isSplashVisible, showUpdateLog, snipMode.active]);

  const flashSelectedImageZoom = () => {
    setShowSelectedImageZoom(true);
    if (selectedImageZoomTimerRef.current) clearTimeout(selectedImageZoomTimerRef.current);
    selectedImageZoomTimerRef.current = setTimeout(() => {
      setShowSelectedImageZoom(false);
      selectedImageZoomTimerRef.current = null;
    }, 1000);
  };

  const startSelectedImagePanDrag = (e: React.MouseEvent | React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPan = selectedImagePanRef.current;
    let latestPan = { ...startPan };
    let moved = false;
    let disposed = false;
    let frame: number | null = null;

    isGlobalMouseDown.current = true;

    const applyLatestPan = () => {
      frame = null;
      if (disposed) return;
      selectedImagePanRef.current = latestPan;
      setSelectedImagePan(latestPan);
    };

    const requestApplyPan = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(applyLatestPan);
    };

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      selectedImagePanRef.current = latestPan;
      setSelectedImagePan(latestPan);
      isGlobalMouseDown.current = false;
      document.removeEventListener('pointermove', onMove as EventListener, true);
      document.removeEventListener('pointerup', onUp as EventListener, true);
      document.removeEventListener('pointercancel', onCancel as EventListener, true);
      document.removeEventListener('mousemove', onMove as EventListener, true);
      document.removeEventListener('mouseup', onUp as EventListener, true);
    };

    const onMove = (ev: PointerEvent | MouseEvent) => {
      if (disposed) return;
      if ('buttons' in ev && (ev.buttons & 1) !== 1) {
        cleanup();
        return;
      }

      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 2) return;
      moved = true;

      ev.preventDefault();
      ev.stopPropagation();
      latestPan = { x: startPan.x + dx, y: startPan.y + dy };
      requestApplyPan();
    };

    const onUp = (ev: PointerEvent | MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
    };

    const onCancel = (ev: PointerEvent | MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
    };

    document.addEventListener('pointermove', onMove as EventListener, true);
    document.addEventListener('pointerup', onUp as EventListener, true);
    document.addEventListener('pointercancel', onCancel as EventListener, true);
    document.addEventListener('mousemove', onMove as EventListener, true);
    document.addEventListener('mouseup', onUp as EventListener, true);
  };

  const startPreviewWindowDrag = (e: React.MouseEvent | React.PointerEvent) => {
    if (e.button !== 2 || previewDragActiveRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    previewDragActiveRef.current = true;
    isGlobalMouseDown.current = true;
    isDraggingTitleRef.current = true;
    setIsDraggingTitle(true);
    setIsOpen(true);
    invoke('set_topmost', { topmost: true }).catch(() => {});

    let lastX = e.screenX;
    let lastY = e.screenY;
    let pendingDx = 0;
    let pendingDy = 0;
    let frame: number | null = null;
    let disposed = false;

    const preventContextMenu = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };

    const moveWindowBy = (dx: number, dy: number) => {
      // 优先走 Rust 增量移动命令；如果用户当前 main.rs 还没包含这个命令，则回退到前端 setPosition。
      invoke('sys_drag_window', { dx, dy }).catch(async () => {
        try {
          const pos = await appWindow.outerPosition();
          await appWindow.setPosition(new PhysicalPosition(
            Math.round(pos.x + dx),
            Math.round(pos.y + dy)
          ));
        } catch (_) {}
      });
    };

    const flushMove = () => {
      frame = null;
      if (disposed) return;
      const dx = pendingDx;
      const dy = pendingDy;
      pendingDx = 0;
      pendingDy = 0;
      if (dx === 0 && dy === 0) return;

      // 使用增量移动窗口，比 startDragging 更适合右键拖动。
      moveWindowBy(dx, dy);
    };

    const onMove = (me: PointerEvent | MouseEvent) => {
      if (disposed) return;
      // 右键没有按住时立即结束，避免松手后继续跟随。
      // MouseEvent.buttons: 左键=1，右键=2；预览窗口移动用的是右键拖动。
      if ('buttons' in me && (me.buttons & 2) !== 2) {
        cleanup();
        return;
      }

      me.preventDefault();
      me.stopPropagation();

      const dx = me.screenX - lastX;
      const dy = me.screenY - lastY;
      lastX = me.screenX;
      lastY = me.screenY;
      if (dx === 0 && dy === 0) return;

      pendingDx += dx;
      pendingDy += dy;
      if (frame === null) frame = requestAnimationFrame(flushMove);
    };

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      if (pendingDx !== 0 || pendingDy !== 0) {
        const dx = pendingDx;
        const dy = pendingDy;
        pendingDx = 0;
        pendingDy = 0;
        moveWindowBy(dx, dy);
      }
      document.removeEventListener('pointermove', onMove as EventListener, true);
      document.removeEventListener('pointerup', cleanup, true);
      document.removeEventListener('mousemove', onMove as EventListener, true);
      document.removeEventListener('mouseup', cleanup, true);
      document.removeEventListener('contextmenu', preventContextMenu, true);
      previewDragActiveRef.current = false;
      isGlobalMouseDown.current = false;
      isDraggingTitleRef.current = false;
      setIsDraggingTitle(false);
    };

    document.addEventListener('pointermove', onMove as EventListener, true);
    document.addEventListener('pointerup', cleanup, true);
    document.addEventListener('mousemove', onMove as EventListener, true);
    document.addEventListener('mouseup', cleanup, true);
    document.addEventListener('contextmenu', preventContextMenu, true);
  };

  const startDrawerTitleDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button,input,textarea,select,a,[role="button"],[contenteditable="true"],[data-no-drag="true"]')) return;

    e.preventDefault();
    e.stopPropagation();

    setIsDraggingTitle(true);
    isDraggingTitleRef.current = true;
    isGlobalMouseDown.current = true;
    setIsPinned(true);
    isPinnedRef.current = true;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    isPointerInsideDrawerRef.current = true;
    setIsOpen(true);
    setDrawerState('open');
    invoke('toggle_pin', { pinned: true }).catch(() => {});
    invoke('set_topmost', { topmost: true }).catch(() => {});

    let lastX = e.screenX;
    let lastY = e.screenY;
    let pendingDx = 0;
    let pendingDy = 0;
    let frame: number | null = null;
    let disposed = false;

    const moveWindowBy = (dx: number, dy: number) => {
      invoke('sys_drag_window', { dx, dy }).catch(async () => {
        try {
          const pos = await appWindow.outerPosition();
          await appWindow.setPosition(new PhysicalPosition(
            Math.round(pos.x + dx),
            Math.round(pos.y + dy),
          ));
        } catch (_) {}
      });
    };

    const flushMove = () => {
      frame = null;
      if (disposed) return;
      const dx = pendingDx;
      const dy = pendingDy;
      pendingDx = 0;
      pendingDy = 0;
      if (dx !== 0 || dy !== 0) moveWindowBy(dx, dy);
    };

    const isLeftInputActive = (event: PointerEvent | MouseEvent) => {
      if (!('buttons' in event)) return true;
      if ((event.buttons & 1) === 1) return true;
      return (
        'pointerType' in event &&
        event.pointerType === 'pen' &&
        typeof event.pressure === 'number' &&
        event.pressure > 0
      );
    };

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      if (pendingDx !== 0 || pendingDy !== 0) {
        const dx = pendingDx;
        const dy = pendingDy;
        pendingDx = 0;
        pendingDy = 0;
        moveWindowBy(dx, dy);
      }
      document.removeEventListener('pointermove', onMove as EventListener, true);
      document.removeEventListener('pointerup', cleanup, true);
      document.removeEventListener('pointercancel', cleanup, true);
      document.removeEventListener('mousemove', onMove as EventListener, true);
      document.removeEventListener('mouseup', cleanup, true);
      isGlobalMouseDown.current = false;
      isDraggingTitleRef.current = false;
      setIsDraggingTitle(false);
      appWindow.setResizable(false).catch(() => {});
    };

    const onMove = (event: PointerEvent | MouseEvent) => {
      if (disposed) return;
      if (!isLeftInputActive(event)) {
        cleanup();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const dx = event.screenX - lastX;
      const dy = event.screenY - lastY;
      lastX = event.screenX;
      lastY = event.screenY;
      if (dx === 0 && dy === 0) return;

      pendingDx += dx;
      pendingDy += dy;
      if (frame === null) frame = requestAnimationFrame(flushMove);
    };

    try {
      const currentTarget = e.currentTarget as HTMLElement | null;
      if (currentTarget && 'setPointerCapture' in currentTarget) {
        currentTarget.setPointerCapture(e.pointerId);
      }
    } catch (_) {}

    document.addEventListener('pointermove', onMove as EventListener, true);
    document.addEventListener('pointerup', cleanup, true);
    document.addEventListener('pointercancel', cleanup, true);
    document.addEventListener('mousemove', onMove as EventListener, true);
    document.addEventListener('mouseup', cleanup, true);
  };

  const getQuickAccessVisual = (item: BufferItem & { isDirectory?: boolean; isUrl?: boolean }) => {
    const ext = getFileExtension(item.name || item.path || item.content || '');
    const pathOrUrl = item.path || item.url || item.content || '';

    if (item.isDirectory) {
      return { icon: <FolderOpen className="w-5 h-5 text-blue-500 dark:text-blue-300" />, label: '文件夹' };
    }
    if (item.type === 'image') {
      return { icon: <ImageIcon className="w-5 h-5 text-pink-500 dark:text-pink-400" />, label: '图片' };
    }
    if (item.type === 'video') {
      return { icon: <Film className="w-5 h-5 text-violet-500 dark:text-violet-400" />, label: '视频' };
    }
    if (item.type === 'text' && (item.isUrl || isProbablyUrl(pathOrUrl))) {
      return { icon: <Link className="w-5 h-5 text-sky-500 dark:text-sky-400" />, label: '网址' };
    }
    if (item.type === 'text') {
      return { icon: <Type className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />, label: '文本' };
    }

    const officeExts = ['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'pdf'];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];
    const audioExts = ['mp3', 'wav', 'aac', 'flac', 'm4a'];
    const codeExts = ['js', 'ts', 'tsx', 'jsx', 'rs', 'py', 'html', 'css', 'json', 'md'];

    if (officeExts.includes(ext)) {
      return { icon: <FileIcon className="w-5 h-5 text-orange-500 dark:text-orange-400" />, label: ext.toUpperCase() || '文档' };
    }
    if (archiveExts.includes(ext)) {
      return { icon: <FileIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />, label: '压缩包' };
    }
    if (audioExts.includes(ext)) {
      return { icon: <FileIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />, label: '音频' };
    }
    if (codeExts.includes(ext)) {
      return { icon: <FileIcon className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />, label: '代码' };
    }

    return { icon: <FileIcon className="w-5 h-5 text-stone-500 dark:text-stone-400" />, label: '文件' };
  };

  const openQuickAccessItem = (item: BufferItem & { isDirectory?: boolean; isUrl?: boolean }, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (item.type === 'image' && item.url) {
      openSelectedImagePreview(item.url);
      return;
    }

    const target = item.path || item.url || item.content || '';
    if (target) {
      invoke('open_file', { path: target }).catch(() => showToast('无法打开项目'));
    }
  };

  const startResizingSidebarAreas = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startHeight = folderRailHeight;
    const minHeight = 220;
    const maxHeight = clamp(window.innerHeight - 260, 260, 620);

    const onMove = (me: PointerEvent) => {
      const nextHeight = clamp(startHeight + (me.clientY - startY), minHeight, maxHeight);
      setFolderRailHeight(nextHeight);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', cleanup, true);
      document.removeEventListener('pointercancel', cleanup, true);
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', cleanup, true);
    document.addEventListener('pointercancel', cleanup, true);
  };

  const isCalendarCompactScale = drawerWidth <= CALENDAR_COMPACT_DRAWER_WIDTH;
  const calendarAvailableWidth = Math.max(1, drawerWidth - DRAWER_SIDE_RAIL_WIDTH - DRAWER_CONTENT_X_PADDING);
  const calendarPageScale = isCalendarCompactScale
    ? clamp(calendarAvailableWidth / CALENDAR_COMPACT_CANVAS_WIDTH, 0.62, 1)
    : 1;
  const calendarPageStyle = isCalendarCompactScale
    ? ({ width: CALENDAR_COMPACT_CANVAS_WIDTH, zoom: calendarPageScale } as React.CSSProperties & { zoom: number })
    : undefined;
  const canvasImageItemsForNav = canvasItems.filter(item => item.item.type === 'image');
  const canvasGeneratedItemsForList: CanvasGeneratedListEntry[] = [
    ...canvasItems
      .filter(item => isCanvasAiGeneratedType(item.ai?.type))
      .map(item => ({ id: item.id, canvasItem: item, item: item.item, ai: item.ai })),
    ...canvasItems.flatMap((canvasItem): CanvasGeneratedListEntry[] => {
      if (!isCanvasAiGeneratorType(canvasItem.ai?.type) && canvasItem.ai?.type !== 'workflow') return [];
      return (canvasItem.ai.outputs || []).reduce<CanvasGeneratedListEntry[]>((entries, output, outputIndex) => {
        const outputItem = createCanvasAiOutputBufferItem(canvasItem, output, outputIndex);
        if (!outputItem) return entries;
        entries.push({
          id: `${canvasItem.id}:${output.id || outputIndex}`,
          canvasItem,
          item: outputItem,
          ai: {
            type: outputItem.type === 'video' ? 'generated-video' : 'generated-image',
            prompt: output.prompt || canvasItem.ai?.prompt,
            status: output.status,
            error: output.error,
            generatedAt: output.generatedAt || canvasItem.ai?.generatedAt,
          },
        });
        return entries;
      }, []);
    }),
  ].sort((a, b) => (b.ai?.generatedAt || b.item.createdAt || 0) - (a.ai?.generatedAt || a.item.createdAt || 0));
  const canvasNavBounds = canvasImageItemsForNav.length > 0 ? {
    left: Math.min(...canvasImageItemsForNav.map(item => item.x)),
    top: Math.min(...canvasImageItemsForNav.map(item => item.y)),
    right: Math.max(...canvasImageItemsForNav.map(item => item.x + item.width)),
    bottom: Math.max(...canvasImageItemsForNav.map(item => item.y + item.height)),
  } : null;
  const canvasNavScale = canvasNavBounds
    ? Math.min(
      (CANVAS_NAV_WIDTH - 18) / Math.max(1, canvasNavBounds.right - canvasNavBounds.left),
      (CANVAS_NAV_HEIGHT - 18) / Math.max(1, canvasNavBounds.bottom - canvasNavBounds.top),
    )
    : 1;
  const getCanvasItemRenderedBox = (canvasItem: CanvasImageItem): CanvasItemBox => {
    const isCanvasAiNodeItem = isCanvasAiGeneratorType(canvasItem.ai?.type) || canvasItem.ai?.type === 'workflow';
    if (!isCanvasAiNodeItem) {
      return {
        x: canvasItem.x,
        y: canvasItem.y,
        width: canvasItem.width,
        height: canvasItem.height,
      };
    }
    const canvasAiOutputs = getCanvasAiOutputPreviewSlots(canvasItem);
    const canvasAiRealOutputs = canvasItem.ai?.outputs || [];
    const canvasAiOutputAspectRatio = canvasAiOutputs[0]?.width && canvasAiOutputs[0]?.height
      ? `${canvasAiOutputs[0].width}:${canvasAiOutputs[0].height}`
      : canvasItem.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO;
    const designSize = getCanvasAiNodeAutoSize({
      type: getCanvasAiNodeAutoSizeType(canvasItem.ai),
      aspectRatio: canvasAiOutputAspectRatio,
      count: canvasItem.ai?.count,
      outputCount: canvasAiOutputs.length || undefined,
      hasPreset: canvasItem.ai?.type !== 'workflow' && !!canvasItem.ai?.presetLabel,
      hasError: !!canvasItem.ai?.error,
      promptText: canvasItem.item.content || '',
      promptExpanded: canvasAiPromptEditingId === canvasItem.id,
      showOutputPreview: canvasItem.ai?.type === 'workflow' || canvasAiRealOutputs.length > 0,
    });
    const nodeScale = Math.min(canvasItem.width / designSize.width, canvasItem.height / designSize.height) || 1;
    return {
      x: canvasItem.x,
      y: canvasItem.y,
      width: designSize.width * nodeScale,
      height: designSize.height * nodeScale,
    };
  };
  const canvasSelectedBoxesForRender = canvasSelectedIds.length > 1
    ? canvasItems.filter(item => canvasSelectedIds.includes(item.id)).map(getCanvasItemRenderedBox)
    : [];
  const canvasSelectedBounds = canvasSelectedBoxesForRender.length > 1 ? {
    x: Math.min(...canvasSelectedBoxesForRender.map(box => box.x)),
    y: Math.min(...canvasSelectedBoxesForRender.map(box => box.y)),
    width: Math.max(...canvasSelectedBoxesForRender.map(box => box.x + box.width)) - Math.min(...canvasSelectedBoxesForRender.map(box => box.x)),
    height: Math.max(...canvasSelectedBoxesForRender.map(box => box.y + box.height)) - Math.min(...canvasSelectedBoxesForRender.map(box => box.y)),
  } : null;
  const canvasSingleSelectedItemForRender = canvasSelectedIds.length === 1
    ? canvasItems.find(item => item.id === canvasSelectedIds[0]) || null
    : null;
  const canvasSingleSelectedBoxForRender = canvasSingleSelectedItemForRender
    ? getCanvasItemRenderedBox(canvasSingleSelectedItemForRender)
    : null;
  const canvasSelectionRect = canvasSelectionBox ? normalizeCanvasSelectionBox(canvasSelectionBox) : null;
  const canvasScaledSelectionRadius = CANVAS_SELECTION_RADIUS;
  const canvasScaledNodeRadius = CANVAS_NODE_RADIUS;
  const canvasRenderScale = clamp(canvasScaleRef.current || canvasScale || 1, CANVAS_MIN_SCALE, CANVAS_MAX_SCALE);
  const canvasItemsById = new Map(canvasItems.map(item => [item.id, item]));
  const canvasConnectionsForRender = canvasItems.flatMap(target => (
    (target.inputs || [])
      .map(sourceId => {
        const source = canvasItemsById.get(sourceId);
        return source ? { source, target } : null;
      })
      .filter((item): item is { source: CanvasImageItem; target: CanvasImageItem } => !!item)
  ));
  const canvasConnectedSourceIds = new Set(canvasConnectionsForRender.map(connection => connection.source.id));
  const canvasConnectedTargetIds = new Set(canvasConnectionsForRender.map(connection => connection.target.id));
  const canvasConnectionDraftPath = canvasConnectionDraft ? (() => {
    const bend = Math.max(80, Math.abs(canvasConnectionDraft.toX - canvasConnectionDraft.fromX) * 0.45);
    const direction = canvasConnectionDraft.toX >= canvasConnectionDraft.fromX ? 1 : -1;
    return `M ${canvasConnectionDraft.fromX} ${canvasConnectionDraft.fromY} C ${canvasConnectionDraft.fromX + bend * direction} ${canvasConnectionDraft.fromY}, ${canvasConnectionDraft.toX - bend * direction} ${canvasConnectionDraft.toY}, ${canvasConnectionDraft.toX} ${canvasConnectionDraft.toY}`;
  })() : '';
  const canvasInputActionDraftPath = canvasInputActionDraft ? (() => {
    const bend = Math.max(80, Math.abs(canvasInputActionDraft.fromX - canvasInputActionDraft.toX) * 0.45);
    const direction = canvasInputActionDraft.toX <= canvasInputActionDraft.fromX ? -1 : 1;
    return `M ${canvasInputActionDraft.fromX} ${canvasInputActionDraft.fromY} C ${canvasInputActionDraft.fromX + bend * direction} ${canvasInputActionDraft.fromY}, ${canvasInputActionDraft.toX - bend * direction} ${canvasInputActionDraft.toY}, ${canvasInputActionDraft.toX} ${canvasInputActionDraft.toY}`;
  })() : '';
  const selectedCanvasAiGenerator = canvasItems.find(item => canvasSelectedIds.includes(item.id) && canUseCanvasItemAsAiTarget(item));
  const selectedCanvasConnectableCount = selectedCanvasAiGenerator
    ? canvasSelectedIds.filter(id => {
      if (id === selectedCanvasAiGenerator.id) return false;
      const item = canvasItemsById.get(id);
      return canUseCanvasItemAsAiInput(item);
    }).length
    : 0;
  const canvasFolderPickerItems = canvasFolderImportPrompt
    ? getFolderImageItemsForCanvas(canvasFolderImportPrompt.folderId)
    : [];
  const canvasPresetEditingPreset = canvasAiPromptPresets.find(item => item.id === canvasPresetEditingId) || null;
  const canvasPresetEditingBuiltIn = CANVAS_AI_PROMPT_PRESETS.some(item => item.id === canvasPresetEditingId);
  const canvasPresetEditingCustom = customCanvasAiPromptPresets.some(item => item.id === canvasPresetEditingId);
  const canvasPresetEditorTitle = canvasPresetEditorMode === 'manage' ? '管理预设' : '新增预设';
  const canvasPresetDeleteLabel = canvasPresetEditingBuiltIn ? '恢复默认' : '删除';
  const canvasWorkflowEditingTemplate = canvasWorkflowTemplates.find(item => item.id === canvasWorkflowEditingId) || null;
  const canvasWorkflowEditingCustom = customCanvasWorkflows.some(item => item.id === canvasWorkflowEditingId);
  const canvasWorkflowEditingBuiltIn = !!canvasWorkflowEditingTemplate?.builtin && !canvasWorkflowEditingCustom;
  const canvasWorkflowEditingNodeCount = canvasWorkflowEditingTemplate?.nodes.length || 0;
  const canvasWorkflowEditingAiCount = canvasWorkflowEditingTemplate?.nodes.filter(node => node.ai?.type === 'image-generator').length || 0;

  return (
    <div
        data-drawer-theme="true"
        className={`${isDark ? 'dark' : ''} drawer-theme w-screen h-screen bg-transparent relative overflow-hidden font-sans select-none flex items-center justify-start pointer-events-none`}
        // 把全局拖拽接管挂在最外层
    >
      <AnimatePresence>
        {toast.show && (
          <motion.div initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 16, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.9 }} className="absolute top-0 right-1/2 translate-x-1/2 z-[999999] bg-stone-800/90 dark:bg-white/90 backdrop-blur-md text-white dark:text-stone-800 px-4 py-2 rounded-full shadow-2xl border border-white/10 dark:border-stone-800/10 text-[11px] font-bold flex items-center gap-2 pointer-events-none will-change-transform">{toast.msg}</motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {snipMode.active && (
          <motion.div
            initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] cursor-crosshair pointer-events-auto will-change-transform"
            onMouseDown={(e) => { isMouseDown.current = true; startPos.current = { x: e.clientX, y: e.clientY }; setSelection({ x: e.clientX, y: e.clientY, w: 0, h: 0 }); }}
            onMouseMove={(e) => { if (!isMouseDown.current) return; const x = Math.min(e.clientX, startPos.current.x); const y = Math.min(e.clientY, startPos.current.y); const w = Math.abs(e.clientX - startPos.current.x); const h = Math.abs(e.clientY - startPos.current.y); setSelection({ x, y, w, h }); }}
            onMouseUp={(e) => {
              isMouseDown.current = false;
              confirmSnip({
                screenX: e.screenX,
                screenY: e.screenY,
                clientX: e.clientX,
                clientY: e.clientY,
              });
            }}
          >
            {snipMode.bg && <img src={snipMode.bg} className="w-full h-full object-cover pointer-events-none" />}

            {selection ? (
              <>
                <div className="absolute inset-0 pointer-events-none">
                  <div
                    className="absolute left-0 right-0 top-0 bg-black/38"
                    style={{ height: selection.y }}
                  />
                  <div
                    className="absolute left-0 bg-black/38"
                    style={{ top: selection.y, width: selection.x, height: selection.h }}
                  />
                  <div
                    className="absolute right-0 bg-black/38"
                    style={{ top: selection.y, left: selection.x + selection.w, height: selection.h }}
                  />
                  <div
                    className="absolute left-0 right-0 bottom-0 bg-black/38"
                    style={{ top: selection.y + selection.h }}
                  />
                </div>

                <div
                  className="absolute pointer-events-none rounded-[4px] border-2 border-emerald-400 shadow-[0_0_0_1px_rgba(255,255,255,0.7),0_0_0_9999px_rgba(0,0,0,0.02)]"
                  style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
                >
                  <div className="absolute inset-0 bg-white/10" />
                  <div className="absolute inset-0 ring-1 ring-emerald-300/80" />
                  <div className="absolute -top-7 right-0 rounded-md bg-emerald-500/95 px-2 py-1 text-[10px] font-semibold text-white shadow-lg whitespace-nowrap">
                    {Math.max(0, Math.round(selection.w))} × {Math.max(0, Math.round(selection.h))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="absolute inset-0 bg-black/38 pointer-events-none" />
                <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-[12px] font-medium text-white shadow-lg pointer-events-none backdrop-blur-sm">
                  拖动鼠标框选截图区域，按 Esc 取消
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🌟 抽屉主体窗口：主窗口里不再包含小条，关闭时直接隐藏整个 main 窗口 */}
      <div
        className="pointer-events-auto absolute inset-0 z-40 w-full h-full min-w-[320px] bg-white/82 dark:bg-stone-900/94 backdrop-blur-2xl border border-white/60 dark:border-stone-800/60 shadow-[0_18px_50px_rgba(0,0,0,0.10)] flex flex-row rounded-[30px] overflow-hidden isolate will-change-transform"
        style={{
          opacity: snipMode.active ? 0 : 1,
          transform: `translateX(${transformX})`,
          transition: transitionStyle,
          borderRadius: 30,
          clipPath: 'inset(0 round 30px)',
          contain: 'paint',
          pointerEvents: isDrawerActive && (isStartupOverlayActive || (drawerState !== 'closed' && drawerState !== 'closing')) ? 'auto' : 'none',
        }}
        onPointerEnter={() => {
          startupAutoCloseSuppressedRef.current = false;
          isPointerInsideDrawerRef.current = true;
          clearIdleAutoClose();
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
          invoke('set_topmost', { topmost: true }).catch(() => {});
        }}
        onPointerDownCapture={() => {
          startupAutoCloseSuppressedRef.current = false;
          isPointerInsideDrawerRef.current = true;
          lastDrawerPointerDownAtRef.current = Date.now();
          clearIdleAutoClose();
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
        }}
        onPointerMove={() => {
          isPointerInsideDrawerRef.current = true;
          clearIdleAutoClose();
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
        }}
        onPointerLeave={(e) => {
          isPointerInsideDrawerRef.current = false;
          // 动画阶段的 pointerleave 很容易是元素移动造成的，不代表鼠标真的离开了抽屉。
          if (isStartupOverlayActive || drawerState !== 'open') return;
          if (shouldBlockAutoClose()) {
            scheduleIdleAutoClose(3000);
            return;
          }

          const isLeftEdge = e.clientX <= 30;
          const isBottomEdge = e.clientY >= drawerHeight - 30;
          scheduleAutoClose(isLeftEdge || isBottomEdge ? 500 : 180);
        }}
      >
            {(isOpen || isPinned || !!selectedImage || !!selectedVideo || showHelp || showQR) && <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-emerald-400/50 z-[100001] transition-colors rounded-l-[30px]" onPointerDown={startResizingWidth} />}
            {(isOpen || isPinned || !!selectedImage || !!selectedVideo || showHelp || showQR) && <div className="absolute bottom-0 left-0 right-0 h-2 cursor-row-resize hover:bg-emerald-400/50 z-[100001] transition-colors rounded-b-[30px]" onPointerDown={startResizingHeight} />}
            {(isOpen || isPinned || !!selectedImage || !!selectedVideo || showHelp || showQR) && <div className="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize hover:bg-emerald-400/50 z-[100002] transition-colors rounded-bl-[30px]" onPointerDown={startResizingCorner} />}
            {(isOpen || isPinned || !!selectedImage || !!selectedVideo || showHelp || showQR) && <div className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize hover:bg-emerald-400/50 z-[100002] transition-colors rounded-br-[30px]" onPointerDown={startResizingRightCorner} />}

            <div className={isCanvasMode && isCanvasChromeHidden ? 'hidden' : 'w-16 h-full bg-stone-100/60 dark:bg-stone-900/40 border-r border-stone-200/50 dark:border-stone-800/50 flex flex-col items-center pt-3 pb-4 z-10 shadow-[4px_0_12px_rgba(0,0,0,0.02)] shrink-0 overflow-hidden'}>
              {/* 主抽屉：固定在侧边栏顶部，不参与文件夹滚动 */}
              <div
                className="relative shrink-0 flex flex-col items-center w-full px-1 pt-0"
                data-folder-drop-id="all"
                data-folder-drop-name="主抽屉"
                onPointerEnter={() => handleDrawerFolderPointerEnter('all')}
                onPointerLeave={() => handleDrawerFolderPointerLeave('all')}
                onPointerUp={() => handleDrawerFolderPointerUp(undefined)}
                onPointerDown={startMainDrawerLongPress}
                onPointerCancel={finishMainDrawerPress}
                onDragEnter={(e) => handleDrawerItemDragOverFolder(e, 'all')}
                onDragOver={(e) => handleDrawerItemDragOverFolder(e, 'all')}
                onDragLeave={(e) => handleDrawerItemDragLeaveFolder(e, 'all')}
                onDrop={(e) => handleDrawerItemDropToFolder(e, undefined)}
              >
                <div
                  onClick={(e) => {
                    if (mainDrawerLongPressTriggeredRef.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    if (isCanvasMode) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      requestAddFolderImagesToCanvas(undefined, '主抽屉', { x: rect.right + 10, y: rect.top });
                      return;
                    }
                    setActiveFolderId('all');
                  }}
                  onPointerUp={finishMainDrawerPress}
                  onPointerLeave={finishMainDrawerPress}
                  className={`relative mb-1 flex h-10 w-10 items-center justify-center overflow-visible rounded-[16px] cursor-pointer transition-all shadow-sm ${isCanvasMode ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20 scale-105 dark:bg-blue-400 dark:text-stone-950' : dragOverFolderId === 'all' ? 'ring-2 ring-blue-300 bg-blue-50 text-blue-600 dark:ring-blue-400/40 dark:bg-blue-400/14 dark:text-blue-200 scale-105' : activeFolderId === 'all' ? 'bg-blue-500 text-white dark:bg-blue-400 dark:text-stone-950 shadow-md shadow-blue-500/20 scale-105' : 'bg-white/65 dark:bg-stone-800/65 backdrop-blur-md text-stone-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-400/12 dark:hover:text-blue-200 hover:scale-105'}`}
                  title={isCanvasMode ? '点击把主抽屉图片加入画布，长按退出画布' : '长按进入无限画布'}
                >
                    <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-0 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-blue-100 shadow-[0_4px_10px_rgba(37,99,235,0.28)] dark:bg-stone-950 dark:text-blue-300 dark:ring-blue-300/25">
                      {isCanvasMode ? (
                      <Lightbulb className="h-[12px] w-[12px]" strokeWidth={2.5} />
                    ) : (
                      <LayoutGrid className="h-[12px] w-[12px]" strokeWidth={2.5} />
                    )}
                  </span>
                  <span className="relative z-10 flex h-7 w-7 items-center justify-center drop-shadow-[0_2px_4px_rgba(15,23,42,0.2)]">
                    {isCanvasMode ? (
                      <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={2.25} />
                    ) : (
                      <Lightbulb className="h-[22px] w-[22px]" strokeWidth={2.25} />
                    )}
                  </span>
                </div>
                <span className={`text-[10px] w-14 text-center truncate px-0.5 cursor-default pb-1 ${activeFolderId === 'all' ? 'text-stone-800 dark:text-stone-200 font-bold' : 'text-stone-500 dark:text-stone-400'}`}>主抽屉</span>
              </div>

              <div className="w-6 h-px bg-stone-300 dark:bg-stone-700/80 shrink-0 my-2 rounded-full" />

              {/* 文件夹区域：只滚动收纳夹和新建按钮 */}
              <div className="relative w-full shrink-0 overflow-hidden" style={{ height: folderRailHeight }}>
                <div
                  className="h-full w-full overflow-y-auto overflow-x-hidden flex flex-col items-center space-y-3 [&::-webkit-scrollbar]:hidden px-1 pt-3 pb-8"
                  style={{
                    WebkitMaskImage: folders.length > 4
                      ? 'linear-gradient(to bottom, black 0%, black calc(100% - 34px), transparent 100%)'
                      : undefined,
                    maskImage: folders.length > 4
                      ? 'linear-gradient(to bottom, black 0%, black calc(100% - 34px), transparent 100%)'
                      : undefined,
                  }}
                >
                  {folders.map((folder, folderIndex) => {
                    const folderTone = DRAWER_FOLDER_TONES[folderIndex % DRAWER_FOLDER_TONES.length];
                    const isFolderActive = activeFolderId === folder.id;
                    const isFolderDragOver = dragOverFolderId === folder.id;
                    return (
                    <div
                      key={folder.id}
                      className="relative shrink-0 flex flex-col items-center w-full group/folder"
                      data-folder-drop-id={folder.id}
                      data-folder-drop-name={folder.name}
                      onPointerEnter={() => handleDrawerFolderPointerEnter(folder.id)}
                      onPointerLeave={() => handleDrawerFolderPointerLeave(folder.id)}
                      onPointerUp={() => handleDrawerFolderPointerUp(folder.id, folder.name)}
                      onDragEnter={(e) => handleDrawerItemDragOverFolder(e, folder.id)}
                      onDragOver={(e) => handleDrawerItemDragOverFolder(e, folder.id)}
                      onDragLeave={(e) => handleDrawerItemDragLeaveFolder(e, folder.id)}
                      onDrop={(e) => handleDrawerItemDropToFolder(e, folder.id, folder.name)}
                    >
                      <div
                        onClick={(e) => {
                          if (isCanvasMode) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            requestAddFolderImagesToCanvas(folder.id, folder.name, { x: rect.right + 10, y: rect.top });
                            return;
                          }
                          setActiveFolderId(folder.id);
                        }}
                        className={`relative mb-1 w-10 h-10 rounded-[16px] flex items-center justify-center cursor-pointer transition-all shadow-sm ${isFolderDragOver ? `${folderTone.drag} scale-105` : isFolderActive ? `${folderTone.active} scale-105` : `bg-white/70 dark:bg-stone-800/65 backdrop-blur-md text-stone-500 dark:text-stone-400 ${folderTone.soft} hover:scale-105`}`}
                        title={isCanvasMode ? `${folder.name}：点击把图片加入画布` : folder.name}
                      >
                        <FolderOpen className={`w-5 h-5 ${isFolderActive ? 'opacity-100' : 'opacity-85'}`} />
                        <span className={`absolute -top-1.5 -right-1.5 ${folderTone.badge} text-white text-[9px] px-1 min-w-[16px] text-center rounded-full font-bold shadow-sm pointer-events-none ring-2 ring-white/80 dark:ring-stone-900/70`}>
                          {items.filter(i => i.folderId === folder.id).length}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                          className="absolute -left-1.5 -top-1.5 opacity-0 group-hover/folder:opacity-100 bg-red-500 text-white rounded-full p-0.5 shadow-sm transition-opacity hover:scale-110 z-10"
                          title="删除文件夹 (不删内容)"
                        ><X className="w-2.5 h-2.5" /></button>
                      </div>

                      {editingFolderId === folder.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => handleRenameFolder(folder.id)}
                          onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameFolder(folder.id);
                          if (e.key === 'Escape') {
                            setEditingFolderId(null);
                          }
                          }}
                          onClick={e => e.stopPropagation()}
                          className="w-14 text-[10px] text-center bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 rounded outline-none focus:ring-1 focus:ring-emerald-500 pb-0.5"
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setRenameValue(folder.name); }}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setEditingFolderId(folder.id); setRenameValue(folder.name); }}
                          className={`text-[10px] w-14 text-center truncate px-0.5 cursor-text pb-1 ${isFolderActive ? `${folderTone.label} font-bold` : 'text-stone-500 dark:text-stone-400 hover:text-blue-500 dark:hover:text-blue-300'}`}
                          title="双击或右键改名"
                        >
                          {folder.name}
                        </span>
                      )}
                    </div>
                    );
                  })}

                  {/* 新建收纳夹按钮保留在文件夹区域底部，文件夹列表滚动到底即可看到 */}
                  <div className="relative shrink-0 flex flex-col items-center w-full mt-1">
                    <button
                      onClick={handleOpenFolderModal}
                      className={`w-10 h-10 mb-1 rounded-[16px] flex items-center justify-center border-2 border-dashed transition-all hover:scale-105 shrink-0 ${showFolderModal ? 'border-blue-300 bg-blue-500 text-white shadow-md shadow-blue-500/20 dark:border-blue-300/55 dark:bg-blue-400 dark:text-stone-950 dark:shadow-blue-950/30' : 'border-blue-200 bg-blue-50/30 text-blue-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 dark:border-blue-400/28 dark:bg-blue-400/10 dark:text-blue-300 dark:hover:border-blue-300/55 dark:hover:bg-blue-400/18'}`}
                      title="新建收纳夹"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] w-14 text-center truncate px-0.5 cursor-default pb-1 text-stone-400 dark:text-stone-500">新增</span>
                  </div>
                </div>

                {folders.length > 4 && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent via-stone-100/45 to-stone-100/90 dark:via-stone-900/35 dark:to-stone-900/80" />
                )}
              </div>

              <div
                data-no-drag="true"
                onPointerDown={startResizingSidebarAreas}
                className="group relative w-full shrink-0 flex items-center justify-center py-1.5 cursor-row-resize"
                title="拖动调整文件夹 / 快速导航区域高度"
              >
                <div className="h-1 w-7 rounded-full bg-stone-300/75 dark:bg-stone-700/80 transition-all group-hover:w-9 group-hover:bg-emerald-400/80 dark:group-hover:bg-emerald-500/70" />
              </div>

              {/* 快速访问 / 便签区域：独立滚动 */}
              <div className="w-full min-h-0 flex-1 flex flex-col items-center overflow-hidden px-1">
                <div className="relative shrink-0 flex flex-col items-center w-full mb-4 mt-1">
                  <div
                    data-no-drag="true"
                    className="relative flex flex-col items-center gap-1 rounded-full bg-white/60 dark:bg-stone-800/60 border border-white/75 dark:border-stone-700/60 p-1 shadow-sm backdrop-blur-md"
                    title={quickRailMode === 'quick' ? '当前：快速访问' : '当前：便签'}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setQuickRailMode('quick');
                        if (activeTab === 'notes') setActiveTab('all');
                      }}
                      className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-all overflow-visible ${
                        quickRailMode === 'quick'
                          ? 'bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100 dark:bg-blue-500/18 dark:text-blue-200 dark:ring-blue-400/25'
                          : 'text-stone-400 hover:bg-white/70 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-700/70 dark:hover:text-stone-300'
                      }`}
                      title="快速访问"
                    >
                      <Compass className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setQuickRailMode('notes');
                        refreshNoteManager();
                        if (activeTab === 'notes') setActiveTab('all');
                      }}
                      className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-all overflow-visible ${
                        quickRailMode === 'notes'
                          ? 'bg-amber-50 text-amber-600 shadow-sm ring-1 ring-amber-100 dark:bg-amber-900/35 dark:text-amber-300 dark:ring-amber-800/55'
                          : 'text-stone-400 hover:bg-white/70 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-700/70 dark:hover:text-stone-300'
                      }`}
                      title={openFloatingNoteCount > 0 ? `便签（${openFloatingNoteCount} 个）` : '便签'}
                    >
                      <BookOpen className="h-4 w-4" />
                      {openFloatingNoteCount > 0 && (
                        <span className="absolute right-0 top-0 z-30 min-w-[15px] h-[15px] translate-x-1/3 -translate-y-1/3 rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-[15px] text-white shadow-sm ring-2 ring-white/80 dark:ring-stone-800/80">
                          {openFloatingNoteCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="w-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center gap-2 [&::-webkit-scrollbar]:hidden pt-3 pb-2">
                  {quickRailMode === 'quick' ? (
                    <>
                      <SystemQuickAccessIcon title="此电脑" icon={<HardDrive className="w-5 h-5 text-blue-500/90 dark:text-blue-400/90" />} path="SYSTEM_COMPUTER" />
                      <SystemQuickAccessIcon title="桌面" icon={<Monitor className="w-5 h-5 text-cyan-500/90 dark:text-cyan-300/90" />} path="SYSTEM_DESKTOP" />
                      <AnimatePresence>
                        {quickAccessItems.map(item => {
                          const visual = getQuickAccessVisual(item as BufferItem & { isDirectory?: boolean; isUrl?: boolean });
                          const quickName = item.name || item.content || item.path || '快速访问';
                          return (
                            <motion.div
                              key={item.id}
                              layout
                              initial={{ opacity: 0, scale: 0.96 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.96 }}
                              transition={{ layout: { type: 'tween', duration: 0.22, ease: [0.16, 1, 0.3, 1] }, default: { type: 'tween', duration: 0.18, ease: [0.16, 1, 0.3, 1] } }}
                              className="relative shrink-0 group/quick flex flex-col items-center w-full"
                            >
                              <button
                                onClick={(e) => openQuickAccessItem(item as BufferItem & { isDirectory?: boolean; isUrl?: boolean }, e)}
                                title={`${visual.label}：${quickName}`}
                                className="w-10 h-10 mb-1 rounded-[16px] bg-white/65 dark:bg-stone-800/65 backdrop-blur-md border border-white/70 dark:border-stone-700/60 shadow-sm flex items-center justify-center hover:scale-105 hover:bg-white dark:hover:bg-stone-700 transition-all"
                              >
                                {visual.icon}
                              </button>
                              <span
                                className="text-[10px] w-14 text-center truncate px-0.5 cursor-default pb-1 text-stone-500 dark:text-stone-400 group-hover/quick:text-blue-500 dark:group-hover/quick:text-blue-300"
                                title={quickName}
                              >
                                {quickName}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  pushDrawerUndoSnapshot('取消快速访问');
                                  setItems(prev => prev.map(i => i.id === item.id ? { ...i, isQuickAccess: false } : i));
                                }}
                                className="absolute -top-1.5 right-1 opacity-0 group-hover/quick:opacity-100 bg-red-500 text-white rounded-full p-0.5 shadow-sm transition-opacity hover:scale-110"
                                title="取消快速访问"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={createBlankFloatingNote}
                        disabled={isCreatingBlankNote}
                        title={`新增便签（${noteShortcut}）`}
                        className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-amber-100/80 bg-amber-50/70 text-amber-600 shadow-sm transition-all hover:scale-105 hover:bg-amber-100 disabled:scale-100 disabled:opacity-55 dark:border-amber-800/45 dark:bg-amber-900/24 dark:text-amber-300 dark:hover:bg-amber-900/38"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      {openFloatingNoteEntries.length === 0 ? (
                        <div className="flex flex-col items-center w-full opacity-70">
                          <div className="w-10 h-10 mb-1 rounded-[16px] border border-dashed border-amber-200 dark:border-amber-800/60 bg-amber-50/45 dark:bg-amber-900/10 flex items-center justify-center">
                            <StickyNote className="w-5 h-5 text-amber-400" />
                          </div>
                          <span className="text-[10px] w-14 text-center text-stone-400 dark:text-stone-500 pb-1">无便签</span>
                        </div>
                      ) : (
                        <AnimatePresence>
                          {openFloatingNoteEntries.map(({ label, snapshot }) => {
                            if (!snapshot) return null;
                            const noteName = snapshot.name || snapshot.content || '桌面便签';
                            const thumb = snapshot.thumbnail || snapshot.url || (snapshot.path && snapshot.type === 'image' ? convertFileSrc(snapshot.path) : '');
                            const noteIcon = snapshot.type === 'image'
                              ? (thumb ? <img src={thumb} alt={noteName} loading="lazy" decoding="async" className="w-full h-full object-cover rounded-[16px]" draggable={false} /> : <ImageIcon className="w-5 h-5 text-stone-500" />)
                              : snapshot.type === 'text'
                                ? <Type className="w-5 h-5 text-amber-500" />
                                : snapshot.type === 'video'
                                  ? <Film className="w-5 h-5 text-emerald-500" />
                                  : <FileIcon className="w-5 h-5 text-stone-400" />;
                            return (
                              <motion.div
                                key={label}
                                layout
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                transition={{ layout: { type: 'tween', duration: 0.22, ease: [0.16, 1, 0.3, 1] }, default: { type: 'tween', duration: 0.18, ease: [0.16, 1, 0.3, 1] } }}
                                className="relative shrink-0 group/note flex flex-col items-center w-full"
                              >
                                <button
                                  onClick={() => focusFloatingNote(label, snapshot)}
                                  title={`显示便签：${noteName}`}
                                  className="relative w-10 h-10 mb-1 rounded-[16px] bg-white/70 dark:bg-stone-800/70 backdrop-blur-md border border-amber-100/80 dark:border-amber-800/40 shadow-sm flex items-center justify-center overflow-hidden hover:scale-105 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                                >
                                  {noteIcon}
                                </button>
                                <span
                                  className="text-[10px] w-14 text-center truncate px-0.5 cursor-default pb-1 text-stone-500 dark:text-stone-400 group-hover/note:text-amber-600 dark:group-hover/note:text-amber-300"
                                  title={noteName}
                                >
                                  {noteName}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    closeFloatingNoteByLabel(label);
                                  }}
                                  className="absolute top-0 right-1 z-30 rounded-full bg-white/80 p-0.5 text-stone-400 opacity-0 shadow-sm ring-1 ring-stone-200/80 transition-all hover:bg-red-50 hover:text-red-400 group-hover/note:opacity-100 dark:bg-stone-800/82 dark:text-stone-500 dark:ring-stone-700/80 dark:hover:bg-red-950/30 dark:hover:text-red-300/80"
                                  title="删除便签"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ====== 右侧主内容区开始 ====== */}
            <div className="flex-1 h-full flex flex-col relative min-w-0 bg-stone-50/30 dark:bg-stone-900/30">

                {/* 🌟 标题栏区域：安全的动态拖拽魔法 */}
                <div
                  className={isCanvasMode && isCanvasChromeHidden ? 'hidden' : 'px-4 pt-3.5 pb-4.5 border-b border-stone-200/50 dark:border-stone-800/50 flex flex-wrap justify-between items-center gap-2 bg-white/50 dark:bg-stone-900/50 relative cursor-move z-20'}
                  onPointerDown={startDrawerTitleDrag}
                >
                  <h2 className="flex h-9 min-w-[140px] max-w-full items-center gap-1.5 font-semibold leading-none text-stone-800 pointer-events-none relative dark:text-stone-100">
                        {isCanvasMode
                      ? <LayoutGrid className="w-4 h-4 text-blue-500 dark:text-blue-300" />
                      : activeFolderId === 'all'
                        ? <Lightbulb className="w-4 h-4 text-blue-500 dark:text-blue-300" />
                        : <FolderOpen className="w-4 h-4 text-emerald-500" />}
                    {isCanvasMode ? '无限画布' : activeFolderId === 'all' ? '灵感抽屉' : folders.find(f => f.id === activeFolderId)?.name || '未知分类'}

                    {/* 小圆点：阻止冒泡，防止触发拖拽 */}
                    <div
                      title={isMobileConnected ? "手机已连接" : "手机未连接 (点此扫码配对)"}
                      className="flex items-center justify-center ml-1 p-1 pointer-events-auto cursor-pointer hover:scale-110 transition-transform"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => { setShowQR(true); setShowSettings(false); }}
                    >
                      <span className={`w-2 h-2 rounded-full transition-colors ${
                        isMobileConnected ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)] animate-pulse" : "bg-amber-400 shadow-[0_0_2px_rgba(251,191,36,0.6)]"
                      }`} />
                    </div>
                  </h2>

                  {/* 右侧按钮组：按钮本身不拖动，按钮之间的空白仍可拖动 */}
                  <div className="z-[100] flex flex-wrap justify-end gap-1.5 flex-1 min-w-[180px] max-w-full">

                    {isSelectMode ? (
                      <>
                        <button onClick={() => setSelectedIds(displayItems.map(i => i.id))} className="text-xs font-medium px-2.5 py-1.5 bg-white/65 dark:bg-stone-800/65 backdrop-blur-md rounded-[14px] text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors shadow-sm">全选</button>
                        {selectedIds.length > 0 && (
                          <>
                            <button
                              onClick={handleExportSelectedItems}
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 rounded-[14px] hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shadow-sm"
                              title="导出选中卡片到本地文件夹"
                            ><Download className="w-3.5 h-3.5" /> 导出</button>
                            <button
                              onClick={() => setShowMoveFolderModal(true)}
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-[14px] hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors shadow-sm"
                              title="移动到分类文件夹"
                            ><Move className="w-3.5 h-3.5" /> 移动</button>
                            <button
                              onClick={() => {
                                const deletableItems = items.filter(i => selectedIds.includes(i.id) && !i.isQuickAccess);

                                requestDeleteDrawerItems(deletableItems, {

                                  label: '批量删除',

                                  afterDelete: () => {

                                    setSelectedIds([]);

                                    setIsSelectMode(false);

                                    setShowMoveFolderModal(false);

                                  },

                                });
                              }}
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-[14px] hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors shadow-sm"
                            ><Trash2 className="w-3.5 h-3.5" /> 删 ({selectedIds.length})</button>
                          </>
                        )}
                        <button onClick={() => { setIsSelectMode(false); setSelectedIds([]); lastSelectedDrawerItemIdRef.current = null; setShowMoveFolderModal(false); }} className="text-xs font-medium px-2.5 py-1.5 bg-white/65 dark:bg-stone-800/65 backdrop-blur-md rounded-[14px] text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors shadow-sm">取消</button>
                      </>
                    ) : (
                      <>
                        {isCanvasMode && (
                          <>
                          {selectedCanvasAiGenerator && selectedCanvasConnectableCount > 0 && (
                            <button
                              onClick={() => connectSelectedCanvasItemsToGenerator(selectedCanvasAiGenerator.id)}
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-[14px] bg-emerald-50 text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                              title="把当前多选的图片/文字连接到 AI 节点"
                            >
                              <Link className="w-3.5 h-3.5" /> 连接 {selectedCanvasConnectableCount}
                            </button>
                          )}
                          {canvasSelectedIds.length > 0 && (
                            <button
                              onClick={() => {
                                const selectedIds = canvasSelectedIdsRef.current;
                                removeCanvasItemsByIds(selectedIds);
                              }}
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-[14px] bg-red-50 text-red-600 shadow-sm transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                              title="删除选中的画布元素（Delete）"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> 删除 {canvasSelectedIds.length}
                            </button>
                          )}
                          <button
                            onClick={requestExitCanvasMode}
                            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-[14px] bg-blue-50 text-blue-700 shadow-sm transition-colors hover:bg-blue-100 dark:bg-blue-400/14 dark:text-blue-200 dark:hover:bg-blue-400/20"
                            title="退出无限画布"
                          >
                            <X className="w-3.5 h-3.5" /> 退出画布
                          </button>
                          </>
                        )}
                        {!isCanvasMode && (
                          <>
                            <button
                              onClick={enterCanvasMode}
                              className={`flex items-center gap-1 text-xs font-medium ${DRAWER_TOOL_BUTTON_BASE_CLASS} hover:bg-cyan-50 hover:text-cyan-600 dark:hover:bg-cyan-400/12 dark:hover:text-cyan-200`}
                              title={`进入生图画布 (${canvasShortcut})`}
                            >
                              <LayoutGrid className="w-3.5 h-3.5" />
                              生图画布
                            </button>
                            <button
                              onClick={() => { setIsSelectMode(true); setSelectedIds([]); lastSelectedDrawerItemIdRef.current = null; setShowSettings(false); setIsSearchActive(false); }}
                              className={`${DRAWER_TOOL_BUTTON_BASE_CLASS} hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-400/12 dark:hover:text-blue-200`}
                              title="多选"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={toggleSearch} className={`${DRAWER_TOOL_BUTTON_BASE_CLASS} ${isSearchActive ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-400/14 dark:text-teal-200 dark:ring-teal-400/20' : 'hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-400/12 dark:hover:text-teal-200'}`} title="搜索 (Ctrl+F)">
                              <Search className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button data-drawer-settings-toggle="true" onClick={toggleSettings} className={`${DRAWER_TOOL_BUTTON_BASE_CLASS} ${showSettings ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-400/14 dark:text-violet-200 dark:ring-violet-400/20' : 'hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-400/12 dark:hover:text-violet-200'}`} title="设置与帮助">
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={handleTogglePin} className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-[14px] transition-colors cursor-pointer shadow-sm bg-white/72 dark:bg-stone-800/65 backdrop-blur-md ${isPinned ? 'text-blue-700 bg-blue-50 ring-1 ring-blue-100 dark:bg-blue-400/14 dark:text-blue-200 dark:ring-blue-400/20' : 'text-stone-500 dark:text-stone-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-400/12 dark:hover:text-blue-200'}`}>
                          {isPinned ? <RotateCcw className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />} {isPinned ? '复位' : '钉住'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className={`${isCanvasMode ? 'hidden' : 'px-2 py-2 flex'} flex-wrap items-center gap-1.5 border-b border-stone-200/50 dark:border-stone-800/50 bg-stone-50/50 dark:bg-stone-900/50 z-10 shrink-0`} onMouseDown={e => e.stopPropagation()}>
                  {!isCanvasMode && (
                    <>
                    <div className="hidden items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900/24 dark:text-amber-300">
                      <ImageIcon className="h-3.5 w-3.5" />
                      拖入图片后可在画布上自由排列
                    </div>
                    {
                    TABS.map(tab => (
                      <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${activeTab === tab.id ? 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900 shadow-sm' : 'bg-transparent text-stone-500 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800/50'}`}>
                        <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? 'opacity-100' : 'opacity-70'}`} />{tab.label}
                      </button>
                    ))}
                    </>
                  )}
                </div>
                <AnimatePresence>
                  {isSearchActive && (
                    <motion.div
                      initial={isShortcutReveal ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={isShortcutReveal ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }}
                      className="overflow-hidden z-20 shrink-0 will-change-transform" onMouseDown={e => e.stopPropagation()}
                    >
                      <div className="px-4 py-2 bg-stone-50/50 dark:bg-stone-900/50 border-b border-stone-200/50 dark:border-stone-800/50">
                        <div className="relative group">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 group-focus-within:text-blue-500 transition-colors" />
                          <input
                            ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索灵感、文件、备注标签..."
                            className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-[16px] pl-9 pr-8 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all shadow-sm"
                          />
                          {searchQuery && (
                            <button onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showSettings && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15, ease: "easeOut" }}
                      data-drawer-settings-panel="true"
                      className="bg-stone-50/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200/50 dark:border-stone-800/50 overflow-hidden relative z-[99] will-change-transform" onMouseDown={e => e.stopPropagation()}
                    >
                      <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600 [&::-webkit-scrollbar-thumb]:rounded-full">

                        <div className="bg-white/75 dark:bg-stone-800/75 rounded-[22px] border border-white/60 dark:border-stone-700/60 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl">
                          <button onClick={() => setActiveSettingCategory(prev => prev === 'appearance' ? '' : 'appearance')} className="w-full flex items-center justify-between p-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Palette className="w-4 h-4 text-emerald-500"/> 外观模式</span>
                            <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${activeSettingCategory === 'appearance' ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {activeSettingCategory === 'appearance' && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15, ease: "easeOut" }} className="overflow-hidden will-change-transform">
                                <div className="px-3 pb-3 pt-1 flex flex-col gap-3 border-t border-stone-100 dark:border-stone-700/50">
                                  <div className="flex items-center justify-between pt-1">
                                    <span className="text-xs font-medium text-stone-600 dark:text-stone-300 flex items-center gap-1.5"><Sun className="w-3.5 h-3.5 text-stone-400" /> 色彩主题</span>
                                    <button onClick={() => setIsDark(!isDark)} className="flex items-center gap-1.5 px-3 py-1 rounded border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-600 text-[11px] font-medium transition-colors">
                                      {isDark ? '切换浅色' : '切换深色'}
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="bg-white/75 dark:bg-stone-800/75 rounded-[22px] border border-white/60 dark:border-stone-700/60 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl">
                          <button onClick={() => setActiveSettingCategory(prev => prev === 'shortcuts' ? '' : 'shortcuts')} className="w-full flex items-center justify-between p-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Keyboard className="w-4 h-4 text-blue-500"/> 快捷键配置</span>
                            <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${activeSettingCategory === 'shortcuts' ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {activeSettingCategory === 'shortcuts' && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15, ease: "easeOut" }} className="overflow-hidden will-change-transform">
                                <div className="px-3 pb-3 pt-1 flex flex-col gap-2.5 border-t border-stone-100 dark:border-stone-700/50">
                                  <div className="flex items-center justify-between pt-1">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">防误触模式</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecording ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecording(true); setIsRecordingSnip(false); setIsRecordingText(false); setIsRecordingSearch(false); setIsRecordingTrigger(false); setIsRecordingNote(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecording) handleRecordShortcut(e, (s: string) => { setShortcut(s); setIsRecording(false); }, 'update-shortcut'); }} onBlur={() => setIsRecording(false)}>{isRecording ? '请按键...' : shortcut}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">极速截图</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingSnip ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingSnip(true); setIsRecording(false); setIsRecordingText(false); setIsRecordingSearch(false); setIsRecordingTrigger(false); setIsRecordingNote(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecordingSnip) handleRecordShortcut(e, (s: string) => { setSnipShortcut(s); setIsRecordingSnip(false); }, 'update-snip-shortcut'); }} onBlur={() => setIsRecordingSnip(false)}>{isRecordingSnip ? '请按键...' : snipShortcut}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">快速记录灵感</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingText ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingText(true); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingSearch(false); setIsRecordingTrigger(false); setIsRecordingNote(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecordingText) handleRecordShortcut(e, (s: string) => { setTextShortcut(s); setIsRecordingText(false); }, 'update-text-shortcut'); }} onBlur={() => setIsRecordingText(false)}>{isRecordingText ? '请按键...' : textShortcut}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">全局搜索唤出</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingSearch ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingSearch(true); setIsRecordingText(false); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingTrigger(false); setIsRecordingNote(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecordingSearch) handleRecordShortcut(e, (s: string) => { setSearchShortcut(s); setIsRecordingSearch(false); }, 'update-search-shortcut'); }} onBlur={() => setIsRecordingSearch(false)}>{isRecordingSearch ? '请按键...' : searchShortcut}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">切换触发入口</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingTrigger ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingTrigger(true); setIsRecordingSearch(false); setIsRecordingText(false); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingNote(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecordingTrigger) handleRecordShortcut(e, (s: string) => { setTriggerShortcut(s); setIsRecordingTrigger(false); }, 'update-trigger-shortcut'); }} onBlur={() => setIsRecordingTrigger(false)}>{isRecordingTrigger ? '请按键...' : triggerShortcut}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">新增便签</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingNote ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingNote(true); setIsRecordingTrigger(false); setIsRecordingSearch(false); setIsRecordingText(false); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecordingNote) handleRecordShortcut(e, (s: string) => { setNoteShortcut(s); setIsRecordingNote(false); }, 'update-note-shortcut'); }} onBlur={() => setIsRecordingNote(false)}>{isRecordingNote ? '请按键...' : noteShortcut}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">切换无限画布</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingCanvas ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingCanvas(true); setIsRecordingNote(false); setIsRecordingTrigger(false); setIsRecordingSearch(false); setIsRecordingText(false); setIsRecording(false); setIsRecordingSnip(false); }} onKeyDown={(e) => { if (isRecordingCanvas) handleRecordShortcut(e, (s: string) => { setCanvasShortcut(s); setIsRecordingCanvas(false); }, 'update-canvas-shortcut'); }} onBlur={() => setIsRecordingCanvas(false)}>{isRecordingCanvas ? '请按键...' : canvasShortcut}</button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="bg-white/75 dark:bg-stone-800/75 rounded-[22px] border border-white/60 dark:border-stone-700/60 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl">
                          <button onClick={() => setActiveSettingCategory(prev => prev === 'ai' ? '' : 'ai')} className="w-full flex items-center justify-between p-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Sparkles className="w-4 h-4 text-amber-500"/> AI 设置</span>
                            <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${activeSettingCategory === 'ai' ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {activeSettingCategory === 'ai' && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15, ease: "easeOut" }} className="overflow-hidden will-change-transform">
                                <div className="px-3 pb-3 pt-1 flex flex-col gap-2.5 border-t border-stone-100 dark:border-stone-700/50">
                                  <div className="flex flex-col gap-2 rounded-[18px] border border-cyan-100 bg-cyan-50/58 px-3 py-2.5 dark:border-cyan-900/45 dark:bg-cyan-950/16">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="flex items-center gap-1.5 text-[11px] font-black text-cyan-800 dark:text-cyan-200">
                                        <Sparkles className="h-3.5 w-3.5" />
                                        AI 生图
                                      </span>
                                      <span className="truncate rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-900/36 dark:text-cyan-200">
                                        {CANVAS_AI_PROVIDER_SELECT_OPTIONS.find(option => option.value === canvasAiProvider)?.label || canvasAiProvider}
                                      </span>
                                    </div>
                                    <label className="flex flex-col gap-1">
                                      <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">接口类型</span>
                                      <select
                                        value={canvasAiProvider}
                                        onChange={(event) => {
                                          const provider = normalizeCanvasAiProvider(event.target.value);
                                          setCanvasAiProvider(provider);
                                          setCanvasAiApiKey(getStoredCanvasAiApiKey(provider));
                                          const endpoint = getStoredCanvasAiEndpoint(provider);
                                          if (endpoint) setCanvasAiEndpoint(endpoint);
                                        }}
                                        className="w-full rounded-[14px] bg-white/82 dark:bg-stone-800/70 border border-cyan-100 dark:border-cyan-900/45 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-cyan-500/20"
                                      >
                                        {CANVAS_AI_PROVIDER_SELECT_OPTIONS.map(option => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="flex flex-col gap-1">
                                      <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">API Key</span>
                                      <input
                                        type="password"
                                        value={canvasAiApiKey}
                                        onChange={(event) => setCanvasAiApiKey(event.target.value)}
                                        placeholder={getCanvasAiApiKeyPlaceholder(canvasAiProvider)}
                                        className="w-full rounded-[14px] bg-white/82 dark:bg-stone-800/70 border border-cyan-100 dark:border-cyan-900/45 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-cyan-500/20"
                                      />
                                    </label>
                                    {isCanvasAiEndpointVisible(canvasAiProvider) && (
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">API Base URL</span>
                                          <button
                                            type="button"
                                            onClick={() => refreshCanvasAiOpenAiModels(false)}
                                            disabled={isRefreshingCanvasAiOpenAiModels || !canvasAiEndpoint.trim() || !canvasAiApiKey.trim()}
                                            className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700 disabled:opacity-45 dark:bg-cyan-900/35 dark:text-cyan-200"
                                          >
                                            {isRefreshingCanvasAiOpenAiModels ? '刷新中' : '刷新模型'}
                                          </button>
                                        </div>
                                        <input
                                          value={canvasAiEndpoint}
                                          onChange={(event) => setCanvasAiEndpoint(event.target.value)}
                                          placeholder={getCanvasAiEndpointPlaceholder(canvasAiProvider)}
                                          className="w-full rounded-[14px] bg-white/82 dark:bg-stone-800/70 border border-cyan-100 dark:border-cyan-900/45 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-cyan-500/20"
                                        />
                                        <span className={`text-[10px] leading-4 ${canvasAiOpenAiModelError ? 'text-red-500 dark:text-red-300' : 'text-stone-400 dark:text-stone-500'}`}>
                                          {canvasAiOpenAiModelError || (canvasAiRemoteModelCount > 0 ? `已读取 ${canvasAiRemoteModelCount} 个模型` : canvasAiRemoteModelEmptyHint)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-2.5 rounded-[18px] border border-amber-100 bg-amber-50/45 px-3 py-2.5 dark:border-amber-800/40 dark:bg-amber-950/12">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="flex items-center gap-1.5 text-[11px] font-black text-amber-800 dark:text-amber-200">
                                        <Palette className="h-3.5 w-3.5" />
                                        CMF 接口
                                      </span>
                                    </div>

                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">接口类型</span>
                                    <select value={aiApiProvider} onChange={e => handleAiProviderChange(e.target.value)} className="w-full rounded-[14px] bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-600 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-emerald-500/20">
                                      <option value="siliconflow">硅基流动 SiliconFlow / 视觉模型</option>
                                      <option value="openai-compatible">OpenAI Compatible</option>
                                      <option value="local">本地分析软件</option>
                                      <option value="custom">自定义 HTTP API</option>
                                    </select>
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">API Base URL / 本地软件地址</span>
                                    <div className="flex gap-1.5">
                                      <input value={aiApiEndpoint} onChange={e => setAiApiEndpoint(e.target.value)} placeholder={isSiliconFlowProvider(aiApiProvider) ? SILICONFLOW_DEFAULT_ENDPOINT : '例如 http://127.0.0.1:8787/analyze 或 https://api.example.com/v1'} className="min-w-0 flex-1 rounded-[14px] bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-600 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-emerald-500/20" />
                                      {isSiliconFlowProvider(aiApiProvider) && (
                                        <button onClick={() => setAiApiEndpoint(SILICONFLOW_DEFAULT_ENDPOINT)} className="shrink-0 rounded-[14px] bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50">默认</button>
                                      )}
                                    </div>
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">API Key</span>
                                    <input type="password" value={aiApiKey} onChange={e => setAiApiKey(e.target.value)} placeholder={isSiliconFlowProvider(aiApiProvider) ? '填入 cloud.siliconflow.cn 创建的 API Key' : '可选，保存在本机配置中'} className="w-full rounded-[14px] bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-600 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-emerald-500/20" />
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">视觉模型 / 分析方案</span>
                                      {isSiliconFlowProvider(aiApiProvider) && (
                                        <button
                                          type="button"
                                          onClick={refreshSiliconFlowVisionModels}
                                          disabled={isRefreshingSiliconFlowModels}
                                          className="shrink-0 rounded-[12px] bg-emerald-50 dark:bg-emerald-900/25 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:cursor-wait disabled:opacity-60"
                                        >{isRefreshingSiliconFlowModels ? '刷新中' : '刷新视觉模型'}</button>
                                      )}
                                    </div>
                                    {isSiliconFlowProvider(aiApiProvider) ? (
                                      <>
                                        <select value={aiApiModel} onChange={e => setAiApiModel(e.target.value)} className="w-full rounded-[14px] bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-600 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-emerald-500/20">
                                          {siliconFlowModelOptions.map(model => <option key={model.value} value={model.value}>{model.label}</option>)}
                                        </select>
                                        <input value={aiApiModel} onChange={e => setAiApiModel(e.target.value)} placeholder="也可以手动粘贴模型 ID，例如 Qwen/Qwen3-VL-32B-Instruct" className="w-full rounded-[14px] bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-600 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-emerald-500/20" />
                                      </>
                                    ) : (
                                      <input value={aiApiModel} onChange={e => setAiApiModel(e.target.value)} placeholder="例如 gpt-4o-mini / cmf-v1 / local-default" className="w-full rounded-[14px] bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-600 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-emerald-500/20" />
                                    )}
                                    {isSiliconFlowProvider(aiApiProvider) && siliconFlowModelListError && (
                                      <span className="text-[10px] leading-4 text-red-500 dark:text-red-300">{siliconFlowModelListError}</span>
                                    )}
                                    {isSiliconFlowProvider(aiApiProvider) && !isSiliconFlowVisionModel(aiApiModel) && (
                                      <span className="text-[10px] leading-4 text-amber-600 dark:text-amber-300">当前模型可能不是视觉模型。图片 CMF 建议选择 Qwen3-VL、Qwen3-Omni、GLM-V、DeepSeek-OCR 等视觉模型。</span>
                                    )}
                                    {isSiliconFlowProvider(aiApiProvider) && (
                                      <span className="text-[10px] leading-4 text-stone-400 dark:text-stone-500">内置列表只做兜底；刷新后会读取你当前 API Key 在 /v1/models 可见的视觉模型。</span>
                                    )}
                                  </label>
                                  <div className="flex items-center justify-between pt-1 text-[11px] text-stone-500 dark:text-stone-400">
                                    <span>{hasAiAnalysis ? (isSiliconFlowProvider(aiApiProvider) ? `已启用硅基流动：${aiApiModel}` : '已启用 AI 分析：配色 + CMF / 造型 / 材料 / 借鉴判断。') : (isSiliconFlowProvider(aiApiProvider) ? '未填写完整硅基流动配置：仅使用本地算法分析配色。' : '未配置 AI：仅使用本地算法分析配色。')}</span>
                                    <button onClick={() => { setAiApiEndpoint(isSiliconFlowProvider(aiApiProvider) ? SILICONFLOW_DEFAULT_ENDPOINT : ''); setAiApiKey(''); setAiApiModel(isSiliconFlowProvider(aiApiProvider) ? SILICONFLOW_DEFAULT_MODEL : ''); }} className="rounded-full bg-stone-100 dark:bg-stone-700 px-3 py-1 text-[10px] font-bold text-stone-500 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600">清空</button>
                                  </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="bg-white/75 dark:bg-stone-800/75 rounded-[22px] border border-white/60 dark:border-stone-700/60 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl">
                          <button onClick={() => setActiveSettingCategory(prev => prev === 'system' ? '' : 'system')} className="w-full flex items-center justify-between p-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Settings className="w-4 h-4 text-purple-500"/> 高级与系统</span>
                            <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${activeSettingCategory === 'system' ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {activeSettingCategory === 'system' && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15, ease: "easeOut" }} className="overflow-hidden will-change-transform">
                                <div className="px-3 pb-3 pt-1 flex flex-col gap-3 border-t border-stone-100 dark:border-stone-700/50">
                                  <div className="flex items-center justify-between pt-1">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300 flex items-center gap-1.5">开机自动启动</span>
                                    <button disabled={isAutoStartChanging} onClick={async () => {
                                      if (isAutoStartChanging) return;
                                      const previous = isAutoStart;
                                      const next = !isAutoStart;
                                      setIsAutoStartChanging(true);
                                      setIsAutoStart(next);
                                      try {
                                        await invoke('set_auto_start', { autoStart: next });
                                        const persisted = await invoke('get_auto_start');
                                        if (!!persisted !== next) throw new Error('autostart state verification failed');
                                        setIsAutoStart(!!persisted);
                                        showToast(next ? '已开启开机自动启动' : '已关闭开机自动启动');
                                      } catch (err) {
                                        console.error('设置开机启动失败:', err);
                                        setIsAutoStart(previous);
                                        showToast('开机启动设置失败');
                                      } finally {
                                        setIsAutoStartChanging(false);
                                      }
                                    }} className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium transition-colors disabled:opacity-60 disabled:cursor-wait ${isAutoStart ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/50' : 'bg-stone-50 text-stone-500 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600'}`}>
                                      {isAutoStart ? <Check className="w-3 h-3" /> : <Power className="w-3 h-3" />} {isAutoStartChanging ? '处理中...' : (isAutoStart ? '已开启' : '已关闭')}
                                    </button>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
                                      <CalendarDays className="w-3.5 h-3.5 text-sky-500" /> 日程通知
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => {
                                          const next = !calendarNotificationsEnabled;
                                          setCalendarNotificationsEnabled(next);
                                          showToast(next ? '已开启日程通知' : '已关闭日程通知');
                                        }}
                                        className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium transition-colors ${
                                          calendarNotificationsEnabled
                                            ? 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800/50'
                                            : 'bg-stone-50 text-stone-500 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600'
                                        }`}
                                        title="每天 10:00 和 15:00 提醒今天未完成日程"
                                      >
                                        {calendarNotificationsEnabled ? <Check className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                                        {calendarNotificationsEnabled ? '已开启' : '已关闭'}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300 flex items-center gap-1.5">触发入口</span>
                                    <button
                                      onClick={toggleTriggerMode}
                                      className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium transition-colors ${triggerMode === 'float' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' : 'bg-stone-50 text-stone-500 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600'}`}
                                      title="切换侧边小条 / 悬浮方块"
                                    >
                                      {triggerMode === 'float' ? <LayoutGrid className="w-3 h-3" /> : <Move className="w-3 h-3" />}
                                      {triggerMode === 'float' ? '悬浮方块' : '侧边小条'}
                                    </button>
                                  </div>
                                  <div className="rounded-[18px] bg-stone-50/70 dark:bg-stone-900/35 border border-stone-200/60 dark:border-stone-700/60 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
                                        <FolderOpen className="w-3.5 h-3.5 text-amber-500" /> 文件缓存路径
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <button onClick={chooseWebImageCacheDir} className="px-2 py-1 rounded border border-stone-200 dark:border-stone-600 bg-white/80 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-600 text-[10px] font-medium transition-colors">修改</button>
                                        <button onClick={resetWebImageCacheDir} className="px-2 py-1 rounded border border-stone-200 dark:border-stone-600 bg-white/80 dark:bg-stone-700 text-stone-500 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-600 text-[10px] font-medium transition-colors">默认</button>
                                      </div>
                                    </div>
                                    <div className="mt-2 rounded-[12px] bg-white/75 dark:bg-stone-800/75 border border-white/70 dark:border-stone-700/70 px-2 py-1.5 text-[10px] leading-4 text-stone-500 dark:text-stone-400 break-all">
                                      {webImageCacheDir || '使用默认缓存目录'}
                                    </div>
                                    <div className="mt-1 text-[10px] leading-4 text-stone-400 dark:text-stone-500">
                                      拖入的本地文件、图片、视频和网页图片都会复制/缓存到这里；卡片打开和定位会指向缓存副本。
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300 flex items-center gap-1.5">手机配对通道</span>
                                    <button onClick={() => { setShowQR(true); setShowSettings(false); }} className="px-2 py-1 rounded border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-600 text-[10px] font-medium transition-colors">显示二维码</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300 flex items-center gap-1.5">使用说明</span>
                                    <button onClick={() => { setShowHelp(true); setShowSettings(false); }} className="flex items-center gap-1 px-2 py-1 rounded border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-600 text-[10px] font-medium transition-colors"><BookOpen className="w-3 h-3" /> 查看文档</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">更新日志</span>
                                    <button onClick={() => { setShowUpdateLog(true); setShowSettings(false); }} className="flex items-center gap-1 px-2 py-1 rounded border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-600 text-[10px] font-medium transition-colors"><Sparkles className="w-3 h-3" /> 查看更新日志</button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div
                  ref={!isCanvasMode ? drawerScrollRef : undefined}
                  onScroll={!isCanvasMode ? handleDrawerContentScroll : undefined}
                  className={`flex-1 relative flex flex-col ${
                  isCanvasMode
                    ? isCanvasChromeHidden ? 'overflow-hidden p-0' : 'overflow-hidden p-3'
                    : 'overflow-y-auto p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600 [&::-webkit-scrollbar-thumb]:rounded-full'
                }`}
                >
                  {isCanvasMode && (
                    <div
                      ref={canvasSurfaceRef}
                      tabIndex={-1}
                      data-canvas-interacting={isCanvasInteracting ? 'true' : undefined}
                      className={`relative min-h-0 flex-1 overflow-auto overscroll-contain bg-[radial-gradient(circle_at_1px_1px,rgba(96,122,158,0.18)_1px,transparent_0)] bg-[length:26px_26px] bg-blue-50/30 shadow-inner outline-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:bg-stone-950/40 ${isCanvasChromeHidden ? 'rounded-none border-0' : 'rounded-[28px] border border-blue-100/80 dark:border-blue-400/18'} ${isCanvasSpacePressed ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      style={{ touchAction: isCanvasSpacePressed ? 'none' : 'auto', overflowAnchor: 'none' }}
                      onPointerEnter={() => {
                        isCanvasPointerInsideRef.current = true;
                      }}
                      onPointerLeave={() => {
                        isCanvasPointerInsideRef.current = false;
                        if (!canvasPanRef.current) setIsCanvasSpacePressed(false);
                      }}
                      onPointerDown={(e) => {
                        setCanvasContextMenu(null);
                        setCanvasInputMenuForId(null);
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
                        e.preventDefault();
                        e.stopPropagation();
                        lastCanvasDragClientRef.current = { x: e.clientX, y: e.clientY };
                        e.dataTransfer.dropEffect = 'copy';
                      }}
                      onDragOver={(e) => {
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
                      {canvasInputPickTargetId && (() => {
                        const target = canvasItemsById.get(canvasInputPickTargetId);
                        const allowVideoReference = target?.ai?.type === 'video-generator' && target.ai.videoInputMode !== 'FLF';
                        return (
                          <div
                            data-no-drag="true"
                            className="fixed left-1/2 top-5 z-[100090] flex -translate-x-1/2 items-center gap-2 rounded-full border border-cyan-200/70 bg-stone-950/86 px-3 py-2 text-[11px] font-bold text-white shadow-[0_12px_32px_rgba(0,0,0,0.24)] backdrop-blur-xl"
                          >
                            {allowVideoReference ? <Film className="h-3.5 w-3.5 text-emerald-300" /> : <ImageIcon className="h-3.5 w-3.5 text-cyan-300" />}
                            {allowVideoReference ? '点击画布图片/视频作为输入' : '点击画布图片作为输入'}
                            <button
                              type="button"
                              className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-white/70 hover:bg-white/16 hover:text-white"
                              onClick={() => setCanvasInputPickTargetId(null)}
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
                          <div className="absolute left-10 top-10 w-[320px] rounded-[26px] border border-dashed border-blue-200 bg-white/68 p-5 text-stone-500 shadow-sm backdrop-blur-xl dark:border-blue-400/24 dark:bg-stone-900/68 dark:text-stone-300">
                            <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-stone-100">
                              <LayoutGrid className="h-4 w-4 text-blue-500 dark:text-blue-300" />
                              无限画布
                            </div>
                            <p className="mt-2 text-xs leading-5">
                              把图片拖进这里，按住图片即可移动排列。离开画布时可以先切回抽屉保留现场，也可以直接退出并选择是否保存到临时文件夹。
                            </p>
                          </div>
                        )}
                        {canvasConnectionsForRender.length > 0 && (
                          <svg
                            className="pointer-events-none absolute left-0 top-0 z-0 overflow-visible"
                            width={canvasSize.width}
                            height={canvasSize.height}
                            viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                          >
                            <defs>
                              <linearGradient id="canvasAiLinkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.7" />
                                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.72" />
                              </linearGradient>
                            </defs>
                            {canvasConnectionsForRender.map(({ source, target }) => {
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
                                <g key={`${source.id}-${target.id}`} className="group/canvas-link">
                                  <path className="pointer-events-none" d={d} stroke="rgba(255,255,255,0.9)" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.24" />
                                  <path className="pointer-events-none transition-opacity group-hover/canvas-link:opacity-100" d={d} stroke="url(#canvasAiLinkGradient)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.78" />
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
                            {canvasItems.filter(item => canUseCanvasItemAsAiTarget(item)).map(item => {
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
                        {canvasItems.map(canvasItem => {
                          const isSelected = canvasSelectedIds.includes(canvasItem.id);
                          const isMultiSelected = isSelected && canvasSelectedIds.length > 1;
                          const isTextCanvasItem = canvasItem.item.type === 'text';
                          const isCanvasAiGeneratorItem = isCanvasAiGeneratorType(canvasItem.ai?.type);
                          const isCanvasWorkflowItem = canvasItem.ai?.type === 'workflow';
                          const isCanvasAiNodeItem = isCanvasAiGeneratorItem || isCanvasWorkflowItem;
                          const canvasAiMediaType = getCanvasAiMediaType(canvasItem.ai);
                          const isCanvasWorkflowAllOutputMode = isCanvasWorkflowItem && canvasItem.ai?.workflowOutputMode === 'all';
                          const canvasWorkflow = isCanvasWorkflowItem ? getCanvasWorkflowTemplateFromNode(canvasItem) : null;
                          const canvasAiOutputs = isCanvasAiNodeItem ? getCanvasAiOutputPreviewSlots(canvasItem) : [];
                          const canvasAiRealOutputs = isCanvasAiNodeItem ? canvasItem.ai?.outputs || [] : [];
                          const showCanvasAiOutputPreview = isCanvasWorkflowItem || canvasAiRealOutputs.length > 0;
                          const isCanvasAiPromptExpanded = canvasAiPromptEditingId === canvasItem.id;
                          const canvasImageSource = getCanvasItemDisplaySource(canvasItem.item);
                          const isGeneratedMediaItem = isCanvasAiGeneratedType(canvasItem.ai?.type);
                          const isGeneratedImageItem = canvasItem.ai?.type === 'generated-image';
                          const isGeneratedVideoItem = canvasItem.ai?.type === 'generated-video';
                          const isGeneratedMediaPending = isGeneratedMediaItem && (canvasItem.ai?.status === 'working' || !canvasImageSource);
                          const isGeneratedMediaError = isGeneratedMediaItem && canvasItem.ai?.status === 'error';
                          const canvasInputPreviewItems = (canvasItem.inputs || [])
                            .map(inputId => canvasItemsById.get(inputId))
                            .filter((item): item is CanvasImageItem => !!item);
                          const canvasAiOutputAspectRatio = canvasAiOutputs[0]?.width && canvasAiOutputs[0]?.height
                            ? `${canvasAiOutputs[0].width}:${canvasAiOutputs[0].height}`
                            : canvasItem.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO;
                          const canvasAiNodeDesignSize = isCanvasAiNodeItem
                            ? getCanvasAiNodeAutoSize({
                              type: getCanvasAiNodeAutoSizeType(canvasItem.ai),
                              aspectRatio: canvasAiOutputAspectRatio,
                              count: canvasItem.ai?.count,
                              outputCount: canvasAiOutputs.length || undefined,
                              hasPreset: !isCanvasWorkflowItem && !!canvasItem.ai?.presetLabel,
                              hasError: !!canvasItem.ai?.error,
                              promptText: canvasItem.item.content || '',
                              promptExpanded: isCanvasAiPromptExpanded,
                              showOutputPreview: showCanvasAiOutputPreview,
                            })
                            : null;
                          const canvasAiOutputTileLayout = isCanvasAiNodeItem && canvasAiNodeDesignSize && showCanvasAiOutputPreview
                            ? getCanvasAiOutputTileLayout({
                              width: canvasAiNodeDesignSize.width,
                              aspectRatio: canvasAiOutputAspectRatio,
                              outputCount: canvasAiOutputs.length || undefined,
                              count: canvasItem.ai?.count,
                              isWorkflow: isCanvasWorkflowItem,
                            })
                            : null;
                          const canvasAiNodeScale = canvasAiNodeDesignSize
                            ? Math.min(canvasItem.width / canvasAiNodeDesignSize.width, canvasItem.height / canvasAiNodeDesignSize.height)
                            : 1;
                          const canvasRenderedItemWidth = canvasAiNodeDesignSize
                            ? canvasAiNodeDesignSize.width * (canvasAiNodeScale || 1)
                            : canvasItem.width;
                          const canvasAiPromptHeight = isCanvasAiGeneratorItem && canvasAiNodeDesignSize
                            ? getCanvasAiPromptAutoHeight(canvasItem.item.content || '', canvasAiNodeDesignSize.width, isCanvasAiPromptExpanded)
                            : 0;
                          const canvasVideoInputMode = canvasItem.ai?.videoInputMode === 'FLF' ? 'FLF' : 'REF';
                          const isCanvasVideoReferenceItem = (inputItem: CanvasImageItem) => {
                            const generatorOutput = getCanvasAiSuccessfulOutputs(inputItem)[0];
                            return inputItem.item.type === 'video'
                              || inputItem.ai?.type === 'video-generator'
                              || generatorOutput?.mediaType === 'video';
                          };
                          const isCanvasImageReferenceItem = (inputItem: CanvasImageItem) => {
                            const generatorOutput = getCanvasAiSuccessfulOutputs(inputItem)[0];
                            return inputItem.item.type === 'image'
                              || inputItem.ai?.type === 'image-generator'
                              || inputItem.ai?.type === 'workflow'
                              || generatorOutput?.mediaType === 'image';
                          };
                          const canvasVideoReferenceImageItems = canvasAiMediaType === 'video'
                            ? canvasInputPreviewItems.filter(item => isCanvasImageReferenceItem(item) && !isCanvasVideoReferenceItem(item))
                            : [];
                          const canvasVideoReferenceVideoItems = canvasAiMediaType === 'video'
                            ? canvasInputPreviewItems.filter(isCanvasVideoReferenceItem)
                            : [];
                          const canvasVideoReferenceImageSlotCount = canvasVideoInputMode === 'FLF' ? 2 : 9;
                          const canvasVideoReferenceVideoSlotCount = canvasVideoInputMode === 'FLF' ? 0 : 1;
                          const canvasVideoReferenceSlotCount = canvasVideoReferenceImageSlotCount + canvasVideoReferenceVideoSlotCount;
                          const canvasVideoReferenceOverflowCount = Math.max(0, canvasVideoReferenceImageItems.length - canvasVideoReferenceImageSlotCount)
                            + Math.max(0, canvasVideoReferenceVideoItems.length - canvasVideoReferenceVideoSlotCount);
                          return (
                            <div
                            key={canvasItem.id}
                            data-canvas-item-id={canvasItem.id}
                            data-canvas-ai-input-id={isCanvasAiNodeItem && canvasConnectionDraft ? canvasItem.id : undefined}
                            className="group/canvas-item absolute overflow-visible"
                            style={{
                              left: canvasItem.x,
                              top: canvasItem.y,
                              width: canvasItem.width,
                              height: canvasItem.height,
                              touchAction: 'none',
                            }}
                            onPointerDown={(e) => startCanvasItemDrag(e, canvasItem.id)}
                            onContextMenu={(e) => {
                              if (!canvasSelectedIdsRef.current.includes(canvasItem.id)) updateCanvasSelection([canvasItem.id]);
                              openCanvasContextMenu(e, 'item', { itemId: canvasItem.id });
                            }}
                            onDoubleClick={(e) => {
                              if (!enableCanvasWorkflowSingleEditForItem(canvasItem.id)) return;
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            >
                              {isCanvasAiNodeItem ? (
                                <div
                                  className="relative h-full w-full overflow-hidden"
                                  style={{ borderRadius: canvasScaledNodeRadius }}
                                >
                                  <div
                                    className={`flex flex-col overflow-hidden border bg-gradient-to-br from-white/88 via-white/76 to-stone-100/72 text-stone-800 shadow-[0_8px_22px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition-[box-shadow,border-color] hover:shadow-[0_12px_30px_rgba(15,23,42,0.10)] dark:from-[#272727]/96 dark:via-[#222222]/96 dark:to-[#1d1d1d]/96 dark:text-white dark:shadow-[0_10px_26px_rgba(0,0,0,0.20)] dark:hover:shadow-[0_14px_34px_rgba(0,0,0,0.24)] ${
                                      isSelected ? 'border-stone-300/62 ring-2 ring-stone-900/[0.05] dark:border-white/20 dark:ring-white/10' : 'border-white/80 dark:border-white/[0.08]'
                                    }`}
                                    style={{
                                      width: canvasAiNodeDesignSize?.width || canvasItem.width,
                                      height: canvasAiNodeDesignSize?.height || canvasItem.height,
                                      borderRadius: canvasScaledNodeRadius,
                                      transform: `scale(${canvasAiNodeScale || 1})`,
                                      transformOrigin: 'left top',
                                    }}
                                  >
                                    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 pt-4">
                                      <div className="flex items-start justify-between gap-3">
                                        <button
                                          data-no-drag="true"
                                          type="button"
                                          onPointerDown={(event) => event.stopPropagation()}
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            setCanvasInputMenuForId(prev => prev === canvasItem.id ? null : canvasItem.id);
                                          }}
                                          className={`group/reference relative flex h-[58px] ${canvasAiMediaType === 'video' ? 'max-w-[560px]' : 'max-w-[330px]'} shrink-0 items-center justify-start overflow-visible rounded-[14px] text-stone-400 transition-colors hover:text-stone-600 dark:text-white/38 dark:hover:text-white/64`}
                                          title="添加或管理参考图"
                                        >
                                          {canvasAiMediaType === 'video' ? (
                                            <span className="flex h-[58px] max-w-full items-center gap-1.5 overflow-hidden">
                                              {Array.from({ length: canvasVideoReferenceSlotCount }).map((_, inputIndex) => {
                                                const isVideoReferenceSlot = canvasVideoInputMode === 'REF' && inputIndex >= canvasVideoReferenceImageSlotCount;
                                                const inputItem = isVideoReferenceSlot
                                                  ? canvasVideoReferenceVideoItems[inputIndex - canvasVideoReferenceImageSlotCount]
                                                  : canvasVideoReferenceImageItems[inputIndex];
                                                const generatorOutput = inputItem ? getCanvasAiSuccessfulOutputs(inputItem)[0] : null;
                                                const generatorOutputSource = generatorOutput?.mediaType === 'video'
                                                  ? ''
                                                  : getCanvasAiOutputDisplaySource(generatorOutput);
                                                const inputPreviewSource = inputItem?.item.type === 'video'
                                                  ? inputItem.item.thumbnail || ''
                                                  : inputItem?.item.type === 'image'
                                                  ? getCanvasItemDisplaySource(inputItem.item)
                                                  : generatorOutputSource;
                                                const slotLabel = isVideoReferenceSlot
                                                  ? '参考视频1'
                                                  : canvasVideoInputMode === 'FLF'
                                                  ? (inputIndex === 0 ? '首帧' : '尾帧')
                                                  : `参考图${inputIndex + 1}`;
                                                return (
                                                  <span
                                                    key={inputItem?.id || `video-reference-${inputIndex}`}
                                                    className={`relative flex h-14 ${canvasVideoInputMode === 'FLF' || isVideoReferenceSlot ? 'w-14' : 'w-12'} shrink-0 items-center justify-center overflow-hidden rounded-[14px] text-stone-400 transition-transform hover:z-10 hover:scale-[1.03] dark:text-white/60`}
                                                    aria-label={inputItem ? '双击移除输入' : `添加${slotLabel}`}
                                                    title={inputItem ? '双击移除输入' : `添加${slotLabel}`}
                                                    onPointerDown={(event) => event.stopPropagation()}
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onDoubleClick={(event) => {
                                                      if (!inputItem) return;
                                                      event.preventDefault();
                                                      event.stopPropagation();
                                                      disconnectCanvasInput(canvasItem.id, inputItem.id);
                                                    }}
                                                  >
                                                    {inputPreviewSource ? (
                                                      <img
                                                        src={inputPreviewSource}
                                                        alt=""
                                                        className="h-full w-full rounded-[14px] border border-stone-200/32 object-cover mix-blend-multiply shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:mix-blend-normal dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]"
                                                        draggable={false}
                                                      />
                                                    ) : inputItem && (isCanvasAiGeneratorType(inputItem.ai?.type) || inputItem.ai?.type === 'workflow') ? (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-stone-400 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-white/58 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        {getCanvasAiMediaType(inputItem.ai) === 'video' ? <Film className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                                      </span>
                                                    ) : inputItem?.item.type === 'video' ? (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-stone-400 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-white/58 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        <Film className="h-4 w-4" />
                                                      </span>
                                                    ) : inputItem ? (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-stone-400 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-white/58 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        <Type className="h-4 w-4" />
                                                      </span>
                                                    ) : (
                                                      <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-[14px] border border-dashed border-stone-300/48 px-1 text-center text-[9px] font-black leading-[11px] text-stone-400 transition-colors group-hover/reference:border-stone-400/70 group-hover/reference:text-stone-500 dark:border-white/[0.12] dark:text-white/34 dark:group-hover/reference:border-white/24 dark:group-hover/reference:text-white/52">
                                                        <span className="text-[10px] leading-none">+</span>
                                                        {isVideoReferenceSlot && <Film className="h-3 w-3" />}
                                                        <span>{slotLabel}</span>
                                                      </span>
                                                    )}
                                                  </span>
                                                );
                                              })}
                                              {canvasVideoReferenceOverflowCount > 0 && (
                                                <span className="flex h-14 w-12 shrink-0 items-center justify-center rounded-[14px] text-[11px] font-black text-stone-500 shadow-[0_10px_24px_rgba(15,23,42,0.14)] dark:text-white/68 dark:shadow-[0_12px_28px_rgba(0,0,0,0.28)]">
                                                  +{canvasVideoReferenceOverflowCount}
                                                </span>
                                              )}
                                            </span>
                                          ) : canvasInputPreviewItems.length > 0 ? (
                                            <span className="flex h-[58px] max-w-full items-center gap-1.5 overflow-hidden">
                                              {canvasInputPreviewItems.slice(0, 6).map((inputItem, inputIndex) => {
                                                const generatorOutput = getCanvasAiSuccessfulOutputs(inputItem)[0];
                                                const generatorOutputSource = generatorOutput?.mediaType === 'video'
                                                  ? ''
                                                  : getCanvasAiOutputDisplaySource(generatorOutput);
                                                const inputPreviewSource = inputItem.item.type === 'image'
                                                  ? getCanvasItemDisplaySource(inputItem.item)
                                                  : generatorOutputSource;
                                                return (
                                                  <span
                                                    key={inputItem.id}
                                                    className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-visible text-stone-400 transition-transform hover:z-10 hover:scale-[1.03] dark:text-white/60"
                                                    style={{
                                                      marginLeft: inputIndex > 0 ? -10 : 0,
                                                    }}
                                                    aria-label="双击移除输入"
                                                    onPointerDown={(event) => event.stopPropagation()}
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onDoubleClick={(event) => {
                                                      event.preventDefault();
                                                      event.stopPropagation();
                                                      disconnectCanvasInput(canvasItem.id, inputItem.id);
                                                    }}
                                                  >
                                                    {inputPreviewSource ? (
                                                      <img
                                                        src={inputPreviewSource}
                                                        alt=""
                                                        className="h-full w-full rounded-[14px] border border-stone-200/32 object-cover mix-blend-multiply shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:mix-blend-normal dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]"
                                                        draggable={false}
                                                      />
                                                    ) : isCanvasAiGeneratorType(inputItem.ai?.type) || inputItem.ai?.type === 'workflow' ? (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-stone-400 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-white/58 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        {getCanvasAiMediaType(inputItem.ai) === 'video' ? <Film className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                                      </span>
                                                    ) : (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-stone-400 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-white/58 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        <Type className="h-4 w-4" />
                                                      </span>
                                                    )}
                                                  </span>
                                                );
                                              })}
                                              {canvasInputPreviewItems.length > 6 && (
                                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] text-[11px] font-black text-stone-500 shadow-[0_10px_24px_rgba(15,23,42,0.14)] dark:text-white/68 dark:shadow-[0_12px_28px_rgba(0,0,0,0.28)]">
                                                  +{canvasInputPreviewItems.length - 6}
                                                </span>
                                              )}
                                            </span>
                                          ) : (
                                            <span className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-stone-300/48 text-[9px] font-black text-stone-400 transition-colors group-hover/reference:border-stone-400/70 group-hover/reference:text-stone-500 dark:border-white/[0.12] dark:text-white/34 dark:group-hover/reference:border-white/24 dark:group-hover/reference:text-white/52">
                                              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                                              <span>参考图</span>
                                            </span>
                                          )}
                                        </button>
                                        <div className="ml-auto flex min-w-[132px] flex-col items-end gap-1.5 pt-0.5">
                                          <span className="max-w-[250px] truncate text-[11px] font-black text-stone-500 dark:text-white/58">
                                            {isCanvasWorkflowItem ? canvasItem.ai?.presetLabel || '工作流模块' : canvasItem.ai?.presetLabel || getCanvasAiNodeTitle(canvasItem.ai)}
                                          </span>
                                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${
                                            canvasItem.ai?.status === 'working'
                                              ? 'bg-stone-900/[0.08] text-stone-700 dark:bg-white/12 dark:text-white'
                                              : canvasItem.ai?.status === 'error'
                                                ? 'bg-red-500/10 text-red-600 dark:bg-red-500/18 dark:text-red-100'
                                                : canvasItem.ai?.status === 'success'
                                                  ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/16 dark:text-emerald-100'
                                                  : 'bg-stone-900/[0.045] text-stone-400 dark:bg-white/[0.07] dark:text-white/42'
                                          }`}>
                                            {canvasItem.ai?.status === 'working'
                                              ? (isCanvasWorkflowItem ? '运行中' : '生成中')
                                              : canvasItem.ai?.status === 'error'
                                                ? '失败'
                                                : canvasItem.ai?.status === 'success'
                                                  ? '完成'
                                                  : '待机'}
                                          </span>
                                        </div>
                                      </div>
                                      {!showCanvasAiOutputPreview && (
                                        <div className="flex h-[220px] shrink-0 items-center justify-center">
                                          <button
                                            data-no-drag="true"
                                            type="button"
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onClick={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              updateCanvasSelection([canvasItem.id]);
                                            }}
                                            className="flex h-full w-full items-center justify-center rounded-[20px] border border-dashed border-stone-300/46 bg-white/[0.28] text-[11px] font-black text-stone-400 transition-colors hover:border-stone-400/64 hover:bg-white/[0.42] hover:text-stone-500 dark:border-white/[0.11] dark:bg-white/[0.025] dark:text-white/30 dark:hover:border-white/22 dark:hover:bg-white/[0.045] dark:hover:text-white/48"
                                            title={canvasAiMediaType === 'video' ? '生成后视频会显示在这里' : '生成后图片会显示在这里'}
                                          >
                                            <span className="flex flex-col items-center gap-2">
                                              {isCanvasWorkflowItem ? <Link className="h-5 w-5" /> : canvasAiMediaType === 'video' ? <Film className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                                              <span>{isCanvasWorkflowItem ? '工作流输出' : canvasAiMediaType === 'video' ? '生成视频' : '生成图'}</span>
                                            </span>
                                          </button>
                                        </div>
                                      )}
                                      {showCanvasAiOutputPreview && canvasAiOutputTileLayout && (
                                        <div className="rounded-[18px] border border-transparent bg-stone-950/[0.035] p-2 dark:bg-white/[0.035]">
                                          <div className="mb-2 flex items-center justify-between text-[10px] font-black text-stone-400 dark:text-white/38">
                                            <span>{isCanvasWorkflowAllOutputMode ? '全部节点输出' : '输出'} {canvasAiOutputs.length}</span>
                                            <div className="flex items-center gap-1.5">
                                              {isCanvasWorkflowItem && (
                                                <button
                                                  data-no-drag="true"
                                                  type="button"
                                                  onPointerDown={(event) => event.stopPropagation()}
                                                  onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    setCanvasWorkflowOutputMode(canvasItem.id, isCanvasWorkflowAllOutputMode ? 'final' : 'all');
                                                  }}
                                                  className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black text-stone-500 transition-colors hover:bg-white hover:text-stone-900 dark:bg-white/10 dark:text-white/58 dark:hover:bg-white/16 dark:hover:text-white"
                                                  title={isCanvasWorkflowAllOutputMode ? '只显示最终输出节点' : '显示所有中间节点和最终节点的输出'}
                                                >
                                                  {isCanvasWorkflowAllOutputMode ? '最终输出' : '全部节点'}
                                                </button>
                                              )}
                                              <span>{canvasItem.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO}</span>
                                            </div>
                                          </div>
                                          <div
                                            className="grid justify-center gap-2"
                                            style={{
                                              gridTemplateColumns: `repeat(${canvasAiOutputTileLayout.columns}, ${canvasAiOutputTileLayout.tileWidth}px)`,
                                            }}
                                          >
                                            {canvasAiOutputs.map((output, outputIndex) => {
                                              const outputSource = getCanvasAiOutputDisplaySource(output);
                                              const isOutputError = output.status === 'error';
                                              const isOutputWorking = output.status === 'working';
                                              const outputMediaType = output.mediaType || canvasAiMediaType;
                                              const outputLabel = output.nodeLabel || output.name || (isCanvasWorkflowItem ? '工作流输出' : canvasItem.ai?.presetLabel || canvasItem.item.name || `输出 ${outputIndex + 1}`);
                                              return (
                                                <div
                                                  key={output.id || `${canvasItem.id}-output-${outputIndex}`}
                                                  data-no-drag="true"
                                                  role="button"
                                                  tabIndex={0}
                                                  onPointerDown={(event) => event.stopPropagation()}
                                                  onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    if (!outputSource) return;
                                                    if (outputMediaType === 'video') setSelectedVideo({ url: outputSource, path: output.path || outputSource });
                                                    else openSelectedImagePreview(outputSource, { fromCanvas: true });
                                                  }}
                                                  onKeyDown={(event) => {
                                                    if (event.key !== 'Enter' && event.key !== ' ') return;
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    if (!outputSource) return;
                                                    if (outputMediaType === 'video') setSelectedVideo({ url: outputSource, path: output.path || outputSource });
                                                    else openSelectedImagePreview(outputSource, { fromCanvas: true });
                                                  }}
                                                  className={`relative overflow-hidden rounded-[14px] border text-center transition-colors ${
                                                    isOutputError
                                                      ? 'border-red-300/20 bg-red-500/12 text-red-100'
                                                      : 'border-white/60 bg-white/58 text-stone-500 hover:bg-white/82 dark:border-white/[0.08] dark:bg-black/16 dark:text-white/56 dark:hover:bg-white/[0.06]'
                                                  }`}
                                                  style={{
                                                    width: canvasAiOutputTileLayout.tileWidth,
                                                    height: canvasAiOutputTileLayout.tileHeight,
                                                  }}
                                                  title={outputLabel}
                                                  >
                                                  <span className="pointer-events-none absolute left-2 top-2 z-10 max-w-[calc(100%-16px)] truncate rounded-full bg-white/86 px-2 py-0.5 text-[9px] font-black text-stone-700 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-md dark:bg-stone-950/74 dark:text-white/82 dark:ring-white/[0.08]">
                                                    {outputLabel}
                                                  </span>
                                                  {outputSource && !isOutputError && (
                                                    <button
                                                      data-no-drag="true"
                                                      type="button"
                                                      className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/88 text-stone-500 opacity-0 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-md transition-opacity hover:bg-white hover:text-cyan-700 group-hover/canvas-item:opacity-100 dark:bg-stone-950/76 dark:text-white/70 dark:ring-white/[0.08] dark:hover:bg-stone-950 dark:hover:text-cyan-200"
                                                      title={outputMediaType === 'video' ? '下载这条视频' : '下载这张图'}
                                                      onPointerDown={(event) => event.stopPropagation()}
                                                      onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        const outputItem = createCanvasAiOutputBufferItem(canvasItem, output, outputIndex);
                                                        if (outputItem) {
                                                          void downloadBufferItems([outputItem]);
                                                        } else {
                                                          showToast(outputMediaType === 'video' ? '这条视频还不能下载' : '这张图还不能下载');
                                                        }
                                                      }}
                                                    >
                                                      <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                  )}
                                                  {outputSource && !isOutputError && outputMediaType === 'video' ? (
                                                    <video
                                                      src={outputSource}
                                                      autoPlay
                                                      muted
                                                      loop
                                                      playsInline
                                                      preload="metadata"
                                                      className="h-full w-full object-contain"
                                                      draggable={false}
                                                    />
                                                  ) : outputSource && !isOutputError ? (
                                                    <img
                                                      src={outputSource}
                                                      alt={outputLabel}
                                                      loading="lazy"
                                                      decoding="async"
                                                      className="h-full w-full object-contain"
                                                      draggable={false}
                                                    />
                                                  ) : (
                                                    <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-2">
                                                      <Sparkles className={`h-4 w-4 ${isOutputWorking ? 'animate-pulse' : ''}`} />
                                                      <span className="line-clamp-2 px-2 pt-5 text-[9px] font-black leading-3">
                                                        {isOutputError ? '生成失败' : isOutputWorking ? '生成中' : outputMediaType === 'video' ? '无视频' : '无图片'}
                                                      </span>
                                                    </span>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                      {isCanvasWorkflowItem ? (
                                        <div className="shrink-0 rounded-[14px] px-0.5 py-1 text-[13px] font-semibold leading-6 text-stone-500 dark:text-white/54">
                                          <div className="flex items-center gap-2 text-stone-600 dark:text-white/68">
                                            <Link className="h-4 w-4" />
                                            <span>{canvasWorkflow?.label || canvasItem.ai?.presetLabel || '未命名工作流'}</span>
                                          </div>
                                          <div className="mt-2 line-clamp-3 text-[12px] leading-5 text-stone-400 dark:text-white/38">
                                            {canvasWorkflow?.hint || '右键选择「展开工作流」可查看和修改内部节点。'}
                                          </div>
                                          <div className="mt-2 inline-flex rounded-full bg-stone-950/[0.045] px-2.5 py-1 text-[10px] font-black text-stone-500 dark:bg-white/[0.07] dark:text-white/50">
                                            {canvasWorkflow?.nodes.filter(node => node.ai?.type === 'image-generator').length || 0} 个生图步骤
                                          </div>
                                        </div>
                                      ) : (
                                        <textarea
                                          data-no-drag="true"
                                          data-canvas-node-prompt="true"
                                          rows={4}
                                          value={canvasItem.item.content || ''}
                                          onChange={(event) => updateCanvasAiGeneratorData(canvasItem.id, { prompt: event.target.value, status: 'idle', error: undefined }, event.target.value)}
                                          onFocus={() => {
                                            setCanvasAiPromptEditingId(canvasItem.id);
                                            resizeCanvasAiPromptEditor(canvasItem.id, true, false);
                                            updateCanvasSelection([canvasItem.id]);
                                          }}
                                          onBlur={() => {
                                            setCanvasAiPromptEditingId(prev => prev === canvasItem.id ? null : prev);
                                            resizeCanvasAiPromptEditor(canvasItem.id, false, true);
                                          }}
                                          onPointerDown={(event) => event.stopPropagation()}
                                          onWheel={(event) => event.stopPropagation()}
                                          placeholder={canvasItem.ai?.presetLabel ? '补充这个预设的细节，不填也可以直接生成。' : canvasAiMediaType === 'video' ? '描述你想要的视频运动、镜头和画面...' : '描述你想要的画面...'}
                                          className="shrink-0 resize-none overflow-y-auto border-0 bg-transparent px-0.5 py-0 text-[15px] font-semibold leading-7 text-stone-700 outline-none placeholder:text-stone-400 focus:ring-0 dark:text-white/74 dark:placeholder:text-white/32"
                                          style={{
                                            height: canvasAiPromptHeight || undefined,
                                          }}
                                        />
                                      )}
                                      {canvasItem.ai?.error && (
                                        <div
                                          className="max-h-16 overflow-y-auto rounded-[12px] bg-red-500/10 px-2.5 py-2 text-[10px] leading-4 text-red-600 dark:bg-red-500/14 dark:text-red-100"
                                          title={canvasItem.ai.error}
                                        >
                                          {getCanvasAiErrorSummary(canvasItem.ai.error)}
                                        </div>
                                      )}
                                    </div>
                                    <div className={`flex h-[52px] shrink-0 items-center ${canvasAiMediaType === 'video' ? 'gap-1.5 px-3' : 'gap-2 px-4'} border-t border-stone-950/[0.045] pb-3 pt-2 text-stone-600 dark:border-white/[0.055] dark:text-white/70`}>
                                      {!isCanvasWorkflowItem && (
                                        <>
                                          {canvasAiMediaType !== 'video' && (
                                          <RoundedSelect
                                            data-no-drag="true"
                                            value={normalizeCanvasAiProvider(canvasItem.ai?.provider || canvasAiProvider)}
                                            options={CANVAS_AI_PROVIDER_SELECT_OPTIONS}
                                            onChange={(value) => {
                                              const provider = normalizeCanvasAiProvider(value);
                                              updateCanvasAiGeneratorData(canvasItem.id, {
                                                provider,
                                                model: getCanvasAiDefaultModel(provider),
                                              });
                                            }}
                                            icon={<Settings className="h-3.5 w-3.5" />}
                                            hideLabel
                                            chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                            title={`中转：${CANVAS_AI_PROVIDER_SELECT_OPTIONS.find(option => option.value === normalizeCanvasAiProvider(canvasItem.ai?.provider || canvasAiProvider))?.label || ''}`}
                                            className={CANVAS_AI_NODE_ICON_SELECT_CLASS}
                                            menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                            optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                            selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
                                            menuMinWidth={190}
                                            menuScale={canvasAiNodeScale || 1}
                                          />
                                          )}
                                          <RoundedSelect
                                            data-no-drag="true"
                                            data-canvas-edit-control="true"
                                            value={canvasItem.ai?.model || getCanvasAiDefaultModel(normalizeCanvasAiProvider(canvasItem.ai?.provider || canvasAiProvider), canvasAiMediaType)}
                                            options={getCanvasAiModelOptionsForProvider(normalizeCanvasAiProvider(canvasItem.ai?.provider || canvasAiProvider), canvasAiMediaType)}
                                            onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { model: value })}
                                            labelClassName={`${canvasAiMediaType === 'video' ? 'max-w-[104px]' : 'max-w-[150px]'} truncate text-center leading-none`}
                                            chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                            title={`模型：${canvasItem.ai?.model || getCanvasAiDefaultModel(normalizeCanvasAiProvider(canvasItem.ai?.provider || canvasAiProvider), canvasAiMediaType)}`}
                                            className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} ${canvasAiMediaType === 'video' ? 'max-w-[132px]' : 'max-w-[178px]'}`}
                                            menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                            optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                            selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
                                            menuMinWidth={260}
                                            menuScale={canvasAiNodeScale || 1}
                                          />
                                          <RoundedSelect
                                            data-no-drag="true"
                                            value={canvasItem.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO}
                                            options={CANVAS_AI_ASPECT_RATIO_OPTIONS}
                                            onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { aspectRatio: value })}
                                            labelClassName="text-center leading-none"
                                            chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                            title={`比例：${canvasItem.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO}`}
                                            className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[62px]`}
                                            menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                            optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                            selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
                                            menuMinWidth={86}
                                            menuScale={canvasAiNodeScale || 1}
                                          />
                                          {canvasAiMediaType !== 'video' ? (
                                          <RoundedSelect
                                            data-no-drag="true"
                                            value={canvasItem.ai?.outputFormat || CANVAS_AI_DEFAULT_OUTPUT_FORMAT}
                                            options={CANVAS_AI_OUTPUT_FORMAT_OPTIONS}
                                            onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { outputFormat: value })}
                                            labelClassName="text-center leading-none uppercase"
                                            chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                            title={`格式：${(canvasItem.ai?.outputFormat || CANVAS_AI_DEFAULT_OUTPUT_FORMAT).toUpperCase()}`}
                                            className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[68px]`}
                                            menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                            optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                            selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
                                            menuMinWidth={78}
                                            menuScale={canvasAiNodeScale || 1}
                                          />
                                          ) : (
                                            <>
                                              <RoundedSelect
                                                data-no-drag="true"
                                                value={canvasItem.ai?.resolution || CANVAS_AI_DEFAULT_VIDEO_RESOLUTION}
                                                options={CANVAS_AI_VIDEO_RESOLUTION_OPTIONS}
                                                onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { resolution: value })}
                                                labelClassName="text-center leading-none"
                                                chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                                title={`分辨率：${canvasItem.ai?.resolution || CANVAS_AI_DEFAULT_VIDEO_RESOLUTION}`}
                                                className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[70px]`}
                                                menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                                optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                                selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
                                                menuMinWidth={86}
                                                menuScale={canvasAiNodeScale || 1}
                                              />
                                              <RoundedSelect
                                                data-no-drag="true"
                                                value={canvasItem.ai?.videoInputMode || 'REF'}
                                                options={CANVAS_AI_VIDEO_INPUT_MODE_OPTIONS}
                                                onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { videoInputMode: value === 'FLF' ? 'FLF' : 'REF' })}
                                                labelClassName="text-center leading-none"
                                                chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                                title={`参考模式：${(canvasItem.ai?.videoInputMode || 'REF') === 'FLF' ? '首尾帧' : '参考图'}`}
                                                className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[76px]`}
                                                menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                                optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                                selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
                                                menuMinWidth={92}
                                                menuScale={canvasAiNodeScale || 1}
                                              />
                                              <RoundedSelect
                                                data-no-drag="true"
                                                value={String(canvasItem.ai?.duration || CANVAS_AI_DEFAULT_VIDEO_DURATION)}
                                                options={CANVAS_AI_VIDEO_DURATION_OPTIONS}
                                                onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { duration: Number(value) || CANVAS_AI_DEFAULT_VIDEO_DURATION })}
                                                labelClassName="text-center leading-none"
                                                chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                                title={`时长：${canvasItem.ai?.duration || CANVAS_AI_DEFAULT_VIDEO_DURATION} 秒`}
                                                className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[64px]`}
                                                menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                                optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                                selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
                                                menuMinWidth={82}
                                                menuScale={canvasAiNodeScale || 1}
                                              />
                                            </>
                                          )}
                                          <RoundedSelect
                                            data-no-drag="true"
                                            value={String(canvasItem.ai?.count || CANVAS_AI_DEFAULT_COUNT)}
                                            options={CANVAS_AI_COUNT_OPTIONS}
                                            onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { count: Number(value) || CANVAS_AI_DEFAULT_COUNT })}
                                            labelClassName="text-center text-[11px] leading-none"
                                            chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                            title={`${canvasAiMediaType === 'video' ? '条数' : '张数'}：${canvasItem.ai?.count || CANVAS_AI_DEFAULT_COUNT}`}
                                            className={CANVAS_AI_NODE_COUNT_SELECT_CLASS}
                                            menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                            optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                            selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
                                            menuMinWidth={86}
                                            menuScale={canvasAiNodeScale || 1}
                                          />
                                        </>
                                      )}
                                      <button
                                        data-no-drag="true"
                                        data-canvas-run-control="true"
                                        type="button"
                                        disabled={canvasItem.ai?.status === 'working'}
                                        onPointerDown={(event) => handleCanvasAiRunPointerDown(event, canvasItem.id)}
                                        onClick={(event) => handleCanvasAiRunClick(event, canvasItem.id)}
                                        className="ml-auto flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[11px] px-2.5 text-[12px] font-black text-stone-500 transition-colors hover:bg-stone-950/[0.05] hover:text-stone-900 disabled:cursor-wait disabled:opacity-45 dark:text-white/58 dark:hover:bg-white/[0.07] dark:hover:text-white"
                                      >
                                        <Play className={`h-4 w-4 fill-current ${canvasItem.ai?.status === 'working' ? 'animate-pulse' : ''}`} />
                                        {canvasItem.ai?.status === 'working'
                                          ? (isCanvasWorkflowItem ? '运行中' : '生成中')
                                          : isCanvasWorkflowItem
                                            ? (hasCanvasAiGeneratedResults(canvasItem) ? '再次运行' : '运行')
                                            : hasCanvasAiGeneratedResults(canvasItem)
                                              ? '再次生成'
                                              : '生成'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : isTextCanvasItem ? (
                                <div
                                  className={`flex h-full flex-col overflow-hidden border bg-blue-50/72 text-stone-800 shadow-[0_10px_26px_rgba(15,23,42,0.10)] transition-[box-shadow,border-color] hover:shadow-[0_14px_32px_rgba(15,23,42,0.12)] dark:bg-stone-900/92 dark:text-stone-100 dark:shadow-[0_12px_30px_rgba(0,0,0,0.24)] ${
                                    isSelected ? 'border-blue-200 dark:border-blue-400/24' : 'border-white/80 dark:border-stone-700/70'
                                  }`}
                                  style={{ borderRadius: canvasScaledNodeRadius }}
                                >
                                  <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-blue-200/70 px-2 text-[11px] font-black text-blue-700 dark:border-stone-700 dark:text-blue-300">
                                    <Type className="h-3.5 w-3.5" />
                                    <span className="truncate">{canvasItem.item.name || '文字卡片'}</span>
                                  </div>
                                  <textarea
                                    data-no-drag="true"
                                    value={canvasItem.item.content || ''}
                                    onChange={(event) => updateCanvasTextItem(canvasItem.id, event.target.value)}
                                    onFocus={() => updateCanvasSelection([canvasItem.id])}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onWheel={(event) => event.stopPropagation()}
                                    placeholder="写点什么..."
                                    className="min-h-[120px] flex-1 resize-y overflow-y-auto bg-transparent px-3 py-2 text-[13px] leading-5 text-stone-700 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500"
                                  />
                                </div>
                              ) : (
                                <div className="relative h-full w-full overflow-visible bg-white/86 shadow-[0_10px_26px_rgba(15,23,42,0.10)] transition-[box-shadow] hover:shadow-[0_14px_32px_rgba(15,23,42,0.12)] dark:bg-stone-900/88 dark:shadow-[0_12px_30px_rgba(0,0,0,0.24)]">
                                  {isGeneratedMediaPending || isGeneratedMediaError ? (
                                    <div className={`flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center ${
                                      isGeneratedMediaError ? 'bg-red-950/28 text-red-100' : 'bg-stone-950/74 text-white'
                                    }`}>
                                      <Sparkles className={`h-5 w-5 ${isGeneratedMediaError ? 'text-red-300' : 'text-cyan-300 animate-pulse'}`} />
                                      <div className="text-[12px] font-black">
                                        {isGeneratedMediaError ? '生成失败' : '生成中'}
                                      </div>
                                      <div
                                        className="max-h-16 max-w-full overflow-hidden px-1 text-[10px] font-medium leading-4 opacity-70"
                                        title={isGeneratedMediaError ? canvasItem.ai?.error || '请重试' : canvasItem.item.name || (isGeneratedVideoItem ? '等待接口返回视频' : '等待接口返回图片')}
                                      >
                                        {isGeneratedMediaError ? getCanvasAiErrorSummary(canvasItem.ai?.error) : canvasItem.item.name || (isGeneratedVideoItem ? '等待接口返回视频' : '等待接口返回图片')}
                                      </div>
                                    </div>
                                  ) : isGeneratedVideoItem || canvasItem.item.type === 'video' ? (
                                    <video
                                      key={canvasImageSource}
                                      src={canvasImageSource}
                                      controls
                                      muted
                                      playsInline
                                      className="h-full w-full select-none object-contain"
                                      draggable={false}
                                    />
                                  ) : (
                                    <img
                                      key={canvasImageSource}
                                      src={canvasImageSource}
                                      alt={canvasItem.item.name || '画布图片'}
                                      loading="eager"
                                      decoding={isGeneratedImageItem ? 'sync' : 'async'}
                                      className="h-full w-full select-none object-contain"
                                      style={{ imageRendering: 'auto' }}
                                      draggable={false}
                                    />
                                  )}
                                  {!isGeneratedMediaItem && (
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/52 to-transparent px-2 py-1.5 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover/canvas-item:opacity-100">
                                      <span className="block truncate">{canvasItem.item.name || canvasItem.item.content}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            <button
                              data-no-drag="true"
                              type="button"
                              className="absolute right-1.5 top-1.5 z-50 rounded-full bg-white/82 p-1 text-stone-400 opacity-0 shadow-sm transition-all hover:bg-red-50 hover:text-red-500 group-hover/canvas-item:opacity-100 dark:bg-stone-900/82 dark:text-stone-500 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                              style={isCanvasAiNodeItem ? {
                                left: Math.max(6, canvasRenderedItemWidth - 30),
                                right: 'auto',
                                top: 6,
                              } : undefined}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeCanvasItemsByIds([canvasItem.id]);
                              }}
                              title="从画布移除"
                            >
                              <X className="h-3 w-3" />
                            </button>
                            {!isMultiSelected && (['nw', 'ne', 'sw', 'se'] as CanvasResizeCorner[]).map(corner => (
                              <button
                                key={corner}
                                data-no-drag="true"
                                type="button"
                                tabIndex={-1}
                                className={`absolute z-30 h-5 w-5 bg-transparent opacity-0 ${
                                  corner === 'nw' ? '-left-2 -top-2 cursor-nwse-resize' :
                                  corner === 'ne' ? '-right-2 -top-2 cursor-nesw-resize' :
                                  corner === 'sw' ? '-left-2 -bottom-2 cursor-nesw-resize' :
                                  '-right-2 -bottom-2 cursor-nwse-resize'
                                }`}
                                onPointerDown={(event) => startCanvasItemResize(event, canvasItem.id, corner)}
                                title="等比缩放"
                              />
                            ))}
                            </div>
                          );
                        })}
                        {canvasItems.map(canvasItem => {
                          const isSelected = canvasSelectedIds.includes(canvasItem.id);
                          const isCanvasConnectedSource = canvasConnectedSourceIds.has(canvasItem.id);
                          if (!canUseCanvasItemAsAiInput(canvasItem) || (!isSelected && !isCanvasConnectedSource)) return null;
                          const itemBox = getCanvasItemRenderedBox(canvasItem);
                          const centerX = itemBox.x + itemBox.width + CANVAS_CONNECTION_HANDLE_OUTSET;
                          const centerY = itemBox.y + itemBox.height / 2;
                          return (
                            <button
                              key={`canvas-source-handle-${canvasItem.id}`}
                              data-no-drag="true"
                              type="button"
                              className="absolute z-[90] flex h-9 w-9 items-center justify-center rounded-full text-cyan-500 transition-all hover:scale-105"
                              style={{
                                left: centerX - 18,
                                top: centerY - 18,
                              }}
                              onPointerDown={(event) => startCanvasConnectionDrag(event, canvasItem.id)}
                              title="拖出连接线到生图/视频节点或工作流模块"
                            >
                              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/95 bg-cyan-500/95 text-white shadow-[0_5px_13px_rgba(8,145,178,0.28)] ring-2 ring-cyan-200/25 backdrop-blur-sm dark:border-white/20 dark:bg-cyan-400 dark:ring-cyan-900/30">
                                <span className="h-1.5 w-1.5 rounded-full bg-white shadow-sm dark:bg-stone-950" />
                              </span>
                            </button>
                          );
                        })}
                        {canvasItems.map(canvasItem => {
                          if (!canUseCanvasItemAsAiTarget(canvasItem)) return null;
                          const isSelected = canvasSelectedIds.includes(canvasItem.id);
                          const isCanvasConnectedTarget = canvasConnectedTargetIds.has(canvasItem.id);
                          const showCanvasTargetHandle = canvasConnectionDraft || canvasInputActionDraft || isSelected || isCanvasConnectedTarget || canvasInputMenuForId === canvasItem.id;
                          if (!showCanvasTargetHandle) return null;
                          const itemBox = getCanvasItemRenderedBox(canvasItem);
                          const centerX = itemBox.x - CANVAS_CONNECTION_HANDLE_OUTSET;
                          const centerY = itemBox.y + itemBox.height / 2;
                          return (
                            <div
                              key={`canvas-target-handle-${canvasItem.id}`}
                              data-no-drag="true"
                              data-canvas-ai-input-id={canvasItem.id}
                              className="absolute z-[90] flex h-9 w-9 items-center justify-center rounded-full text-white"
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
                              title={canvasItem.ai?.type === 'workflow' ? '连接到此工作流模块' : `连接到此 ${getCanvasAiNodeTitle(canvasItem.ai)}`}
                            >
                              <button
                                type="button"
                                data-canvas-ai-input-id={canvasItem.id}
                                title={canvasItem.ai?.type === 'workflow' ? '连接到此工作流模块' : `连接到此 ${getCanvasAiNodeTitle(canvasItem.ai)}`}
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
                          const canvasAiOutputs = getCanvasAiOutputPreviewSlots(canvasItem);
                          const canvasAiRealOutputs = canvasItem.ai?.outputs || [];
                          const canvasAiOutputAspectRatio = canvasAiOutputs[0]?.width && canvasAiOutputs[0]?.height
                            ? `${canvasAiOutputs[0].width}:${canvasAiOutputs[0].height}`
                            : canvasItem.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO;
                          const canvasAiNodeDesignSize = getCanvasAiNodeAutoSize({
                            type: getCanvasAiNodeAutoSizeType(canvasItem.ai),
                            aspectRatio: canvasAiOutputAspectRatio,
                            count: canvasItem.ai?.count,
                            outputCount: canvasAiOutputs.length || undefined,
                            hasPreset: canvasItem.ai?.type !== 'workflow' && !!canvasItem.ai?.presetLabel,
                            hasError: !!canvasItem.ai?.error,
                            promptText: canvasItem.item.content || '',
                            promptExpanded: canvasAiPromptEditingId === canvasItem.id,
                            showOutputPreview: canvasItem.ai?.type === 'workflow' || canvasAiRealOutputs.length > 0,
                          });
                          const nodeScale = Math.min(canvasItem.width / canvasAiNodeDesignSize.width, canvasItem.height / canvasAiNodeDesignSize.height) || 1;
                          const referenceLeft = canvasItem.x + 16 * nodeScale;
                          const referenceTop = canvasItem.y + 16 * nodeScale;
                          const referenceSize = 58 * nodeScale;
                          const menuScale = Math.max(0.35, Math.min(1, nodeScale));
                          const canUploadReferenceVideo = canvasItem.ai?.type === 'video-generator' && canvasItem.ai?.videoInputMode !== 'FLF';
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
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-white/88 dark:hover:bg-white/10 dark:hover:text-white"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  startPickCanvasImageForGenerator(canvasItem.id);
                                }}
                              >
                                <ImageIcon className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300" />
                                画布图片
                              </button>
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
                        {canvasSingleSelectedBoxForRender && (
                          <div
                            className="pointer-events-none absolute z-[60] border-2 border-blue-300/90 bg-blue-300/[0.04] shadow-[0_0_0_3px_rgba(255,255,255,0.28)] dark:border-blue-400/50 dark:shadow-[0_0_0_3px_rgba(0,0,0,0.16)]"
                            style={{
                              left: canvasSingleSelectedBoxForRender.x - 12,
                              top: canvasSingleSelectedBoxForRender.y - 12,
                              width: canvasSingleSelectedBoxForRender.width + 24,
                              height: canvasSingleSelectedBoxForRender.height + 24,
                              borderRadius: canvasScaledSelectionRadius,
                            }}
                          />
                        )}
                        {canvasSelectedBounds && (
                          <div
                            className="pointer-events-none absolute z-[60] border-2 border-blue-400/85 bg-blue-300/[0.06]"
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
                                className={`pointer-events-auto absolute h-6 w-6 bg-transparent opacity-0 ${
                                  corner === 'nw' ? '-left-3 -top-3 cursor-nwse-resize' :
                                  corner === 'ne' ? '-right-3 -top-3 cursor-nesw-resize' :
                                  corner === 'sw' ? '-left-3 -bottom-3 cursor-nesw-resize' :
                                  '-right-3 -bottom-3 cursor-nwse-resize'
                                }`}
                                onPointerDown={(event) => startCanvasGroupResize(event, corner)}
                                title="整体缩放"
                              />
                            ))}
                          </div>
                        )}
                        {canvasSelectionRect && (
                          <div
                            className="pointer-events-none absolute border border-blue-400 bg-blue-300/16"
                            style={{
                              left: canvasSelectionRect.x,
                              top: canvasSelectionRect.y,
                              width: canvasSelectionRect.width,
                              height: canvasSelectionRect.height,
                              borderRadius: canvasScaledSelectionRadius,
                            }}
                          />
                        )}
                        </div>
                      </div>
                    </div>
                  )}
                  {isCanvasMode && isCanvasAiPanelOpen && (
                    <motion.div
                      data-no-drag="true"
                      data-canvas-floating-layer="true"
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      className="absolute left-4 top-4 z-[100050] w-[320px] rounded-[22px] border border-white/60 bg-white/86 p-3 text-stone-700 shadow-[0_16px_42px_rgba(0,0,0,0.16)] backdrop-blur-2xl dark:border-stone-700/70 dark:bg-stone-900/84 dark:text-stone-200"
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onWheel={(event) => event.stopPropagation()}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-black">
                          <Settings className="h-4 w-4 text-cyan-500" />
                          <span>AI API 设置</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsCanvasAiPanelOpen(false)}
                          className="rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-red-300"
                          title="关闭"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid gap-2">
                        <RoundedSelect
                          data-no-drag="true"
                          data-canvas-edit-control="true"
                          value={canvasAiProvider}
                          options={CANVAS_AI_PROVIDER_SELECT_OPTIONS}
                          onChange={(value) => {
                            const provider = normalizeCanvasAiProvider(value);
                            setCanvasAiProvider(provider);
                            setCanvasAiApiKey(getStoredCanvasAiApiKey(provider));
                            const endpoint = getStoredCanvasAiEndpoint(provider);
                            if (endpoint) setCanvasAiEndpoint(endpoint);
                          }}
                          className={CANVAS_AI_PANEL_SELECT_CLASS}
                          menuMinWidth={220}
                        />
                        <input
                          data-no-drag="true"
                          data-canvas-edit-control="true"
                          type="password"
                          value={canvasAiApiKey}
                          onPointerDown={stopCanvasEditEvent}
                          onMouseDown={stopCanvasEditEvent}
                          onDoubleClick={stopCanvasEditEvent}
                          onKeyDown={stopCanvasEditEvent}
                          onChange={(event) => setCanvasAiApiKey(event.target.value)}
                          placeholder={getCanvasAiApiKeyPlaceholder(canvasAiProvider)}
                          className="w-full rounded-[14px] border border-stone-200/80 bg-white/76 px-3 py-1.5 text-xs text-stone-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 dark:border-stone-700 dark:bg-stone-950/36 dark:text-stone-100 dark:focus:border-cyan-700 dark:focus:ring-cyan-900/30"
                        />
                        {isCanvasAiEndpointVisible(canvasAiProvider) && (
                          <div className="grid gap-1">
                            <div className="flex items-center gap-1.5">
                              <input
                                data-no-drag="true"
                                data-canvas-edit-control="true"
                                value={canvasAiEndpoint}
                                onPointerDown={stopCanvasEditEvent}
                                onMouseDown={stopCanvasEditEvent}
                                onDoubleClick={stopCanvasEditEvent}
                                onKeyDown={stopCanvasEditEvent}
                                onChange={(event) => setCanvasAiEndpoint(event.target.value)}
                                placeholder={getCanvasAiEndpointPlaceholder(canvasAiProvider)}
                                className="min-w-0 flex-1 rounded-[14px] border border-stone-200/80 bg-white/76 px-3 py-1.5 text-xs text-stone-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 dark:border-stone-700 dark:bg-stone-950/36 dark:text-stone-100 dark:focus:border-cyan-700 dark:focus:ring-cyan-900/30"
                              />
                              <button
                                type="button"
                                data-no-drag="true"
                                data-canvas-edit-control="true"
                                onPointerDown={stopCanvasEditEvent}
                                onMouseDown={stopCanvasEditEvent}
                                onClick={() => refreshCanvasAiOpenAiModels(false)}
                                disabled={isRefreshingCanvasAiOpenAiModels || !canvasAiEndpoint.trim() || !canvasAiApiKey.trim()}
                                className="h-[30px] shrink-0 rounded-[13px] bg-cyan-100 px-2 text-[10px] font-bold text-cyan-700 disabled:opacity-45 dark:bg-cyan-900/35 dark:text-cyan-200"
                              >
                                {isRefreshingCanvasAiOpenAiModels ? '刷新中' : '模型'}
                              </button>
                            </div>
                            <span className={`px-1 text-[10px] leading-4 ${canvasAiOpenAiModelError ? 'text-red-500 dark:text-red-300' : 'text-stone-400 dark:text-stone-500'}`}>
                              {canvasAiOpenAiModelError || (canvasAiRemoteModelCount > 0 ? `已读取 ${canvasAiRemoteModelCount} 个模型` : canvasAiRemoteModelEmptyHint)}
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                  {isCanvasMode && isCanvasPresetEditorOpen && (
                    <motion.div
                      data-no-drag="true"
                      data-canvas-floating-layer="true"
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      className="absolute left-1/2 top-14 z-[100070] w-[320px] -translate-x-1/2 rounded-[22px] border border-white/70 bg-white/90 p-3 text-stone-700 shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-stone-950/90 dark:text-stone-200"
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onWheel={(event) => event.stopPropagation()}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-black">
                          <Sparkles className="h-4 w-4 text-cyan-500" />
                          <span>{canvasPresetEditorTitle}</span>
                        </div>
                        <button
                          type="button"
                          onClick={closeCanvasPresetEditor}
                          className="rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-red-300"
                          title="关闭"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void importCanvasTemplateFile('preset')}
                          className="rounded-[13px] bg-stone-100 px-2.5 py-1 text-[10px] font-black text-stone-600 transition-colors hover:bg-stone-200 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/14"
                        >
                          导入预设
                        </button>
                        {canvasPresetEditorMode === 'manage' && (
                          <button
                            type="button"
                            onClick={exportCurrentCanvasPreset}
                            className="rounded-[13px] bg-cyan-50 px-2.5 py-1 text-[10px] font-black text-cyan-700 transition-colors hover:bg-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-100 dark:hover:bg-cyan-400/16"
                          >
                            导出当前
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={exportAllCustomCanvasPresets}
                          className="rounded-[13px] bg-cyan-50 px-2.5 py-1 text-[10px] font-black text-cyan-700 transition-colors hover:bg-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-100 dark:hover:bg-cyan-400/16"
                        >
                          导出自定义
                        </button>
                      </div>
                      <div className="grid gap-2">
                        {canvasPresetEditorMode === 'manage' && (
                          <div className="grid gap-1.5 rounded-[16px] border border-cyan-100/80 bg-cyan-50/58 p-2 dark:border-cyan-400/16 dark:bg-cyan-400/10">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black text-cyan-700 dark:text-cyan-200">选择预设</span>
                              {canvasPresetEditingBuiltIn && !canvasPresetEditingCustom && (
                                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black text-cyan-600 dark:bg-white/10 dark:text-cyan-100">
                                  内置
                                </span>
                              )}
                              {canvasPresetEditingCustom && (
                                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black text-cyan-600 dark:bg-white/10 dark:text-cyan-100">
                                  {canvasPresetEditingBuiltIn ? '已修改' : '自定义'}
                                </span>
                              )}
                            </div>
                            <RoundedSelect
                              data-no-drag="true"
                              data-canvas-edit-control="true"
                              value={canvasPresetEditingId}
                              options={canvasAiPromptPresets.map(preset => ({ value: preset.id, label: preset.label }))}
                              onChange={selectCanvasPresetForEdit}
                              className="h-8 w-full rounded-[13px] border border-white/70 bg-white/84 px-3 text-xs font-bold text-stone-700 shadow-sm dark:border-white/10 dark:bg-stone-950/44 dark:text-stone-100"
                              menuClassName="!z-[100090] !min-w-[220px]"
                              menuMinWidth={220}
                            />
                          </div>
                        )}
                        <input
                          data-no-drag="true"
                          value={canvasPresetNameDraft}
                          onChange={(event) => setCanvasPresetNameDraft(event.target.value)}
                          placeholder="预设名称"
                          maxLength={24}
                          className="h-9 rounded-[15px] border border-stone-200/80 bg-white/76 px-3 text-xs font-bold text-stone-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 dark:border-stone-700 dark:bg-stone-950/48 dark:text-stone-100 dark:focus:border-cyan-700 dark:focus:ring-cyan-900/30"
                        />
                        <textarea
                          data-no-drag="true"
                          value={canvasPresetPromptDraft}
                          onChange={(event) => setCanvasPresetPromptDraft(event.target.value)}
                          onWheel={(event) => event.stopPropagation()}
                          placeholder="写入这个预设的隐藏 Prompt。创建预设卡片时，节点输入框会保持空白。"
                          className="h-36 resize-y rounded-[16px] border border-stone-200/80 bg-white/76 px-3 py-2 text-xs leading-5 text-stone-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 dark:border-stone-700 dark:bg-stone-950/48 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-cyan-700 dark:focus:ring-cyan-900/30"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            {canvasPresetEditorMode === 'manage' && canvasPresetEditingPreset && (
                              <button
                                type="button"
                                onClick={deleteCanvasAiCustomPromptPreset}
                                disabled={!canvasPresetEditingCustom}
                                className="rounded-[15px] bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-300 dark:bg-red-400/10 dark:text-red-200 dark:hover:bg-red-400/16 dark:disabled:bg-stone-800 dark:disabled:text-stone-600"
                              >
                                {canvasPresetDeleteLabel}
                              </button>
                            )}
                          </div>
                          <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={closeCanvasPresetEditor}
                            className="rounded-[15px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={saveCanvasAiCustomPromptPreset}
                            className="rounded-[15px] bg-cyan-500 px-3 py-1.5 text-xs font-black text-white shadow-sm shadow-cyan-500/20 transition-colors hover:bg-cyan-400 dark:bg-cyan-400 dark:text-stone-950 dark:hover:bg-cyan-300"
                          >
                            {canvasPresetEditorMode === 'manage' ? '保存修改' : '保存'}
                          </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  {isCanvasMode && isCanvasWorkflowManagerOpen && (
                    <motion.div
                      data-no-drag="true"
                      data-canvas-floating-layer="true"
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      className="absolute left-1/2 top-14 z-[100070] w-[340px] -translate-x-1/2 rounded-[22px] border border-white/70 bg-white/90 p-3 text-stone-700 shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-stone-950/90 dark:text-stone-200"
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onWheel={(event) => event.stopPropagation()}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-black">
                          <BookOpen className="h-4 w-4 text-emerald-500" />
                          <span>管理工作流</span>
                        </div>
                        <button
                          type="button"
                          onClick={closeCanvasWorkflowManager}
                          className="rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-red-300"
                          title="关闭"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void importCanvasTemplateFile('workflow')}
                          className="rounded-[13px] bg-stone-100 px-2.5 py-1 text-[10px] font-black text-stone-600 transition-colors hover:bg-stone-200 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/14"
                        >
                          导入工作流
                        </button>
                        <button
                          type="button"
                          onClick={exportCurrentCanvasWorkflow}
                          className="rounded-[13px] bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-100 dark:hover:bg-emerald-400/16"
                        >
                          导出当前
                        </button>
                        <button
                          type="button"
                          onClick={exportAllCustomCanvasWorkflows}
                          className="rounded-[13px] bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-100 dark:hover:bg-emerald-400/16"
                        >
                          导出自定义
                        </button>
                      </div>
                      <div className="grid gap-2">
                        <div className="grid gap-1.5 rounded-[16px] border border-emerald-100/80 bg-emerald-50/58 p-2 dark:border-emerald-400/16 dark:bg-emerald-400/10">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-200">选择工作流</span>
                            {canvasWorkflowEditingBuiltIn && (
                              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black text-emerald-600 dark:bg-white/10 dark:text-emerald-100">
                                内置
                              </span>
                            )}
                            {canvasWorkflowEditingCustom && (
                              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black text-emerald-600 dark:bg-white/10 dark:text-emerald-100">
                                自定义
                              </span>
                            )}
                          </div>
                          <RoundedSelect
                            data-no-drag="true"
                            data-canvas-edit-control="true"
                            value={canvasWorkflowEditingId}
                            options={canvasWorkflowManagerOptions}
                            onChange={selectCanvasWorkflowForEdit}
                            className="h-8 w-full rounded-[13px] border border-white/70 bg-white/84 px-3 text-xs font-bold text-stone-700 shadow-sm dark:border-white/10 dark:bg-stone-950/44 dark:text-stone-100"
                            menuClassName="!z-[100090] !min-w-[230px]"
                            menuMinWidth={230}
                          />
                        </div>
                        <input
                          data-no-drag="true"
                          value={canvasWorkflowNameDraft}
                          onChange={(event) => setCanvasWorkflowNameDraft(event.target.value)}
                          placeholder="工作流名称"
                          maxLength={32}
                          className="h-9 rounded-[15px] border border-stone-200/80 bg-white/76 px-3 text-xs font-bold text-stone-700 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/50 dark:border-stone-700 dark:bg-stone-950/48 dark:text-stone-100 dark:focus:border-emerald-700 dark:focus:ring-emerald-900/30"
                        />
                        <textarea
                          data-no-drag="true"
                          value={canvasWorkflowHintDraft}
                          onChange={(event) => setCanvasWorkflowHintDraft(event.target.value)}
                          onWheel={(event) => event.stopPropagation()}
                          placeholder="工作流说明"
                          maxLength={80}
                          className="h-20 resize-y rounded-[16px] border border-stone-200/80 bg-white/76 px-3 py-2 text-xs leading-5 text-stone-700 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/50 dark:border-stone-700 dark:bg-stone-950/48 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-emerald-700 dark:focus:ring-emerald-900/30"
                        />
                        <div className="flex flex-wrap gap-1.5 text-[10px] font-black text-stone-500 dark:text-stone-400">
                          <span className="rounded-full bg-stone-100 px-2 py-1 dark:bg-white/10">{canvasWorkflowEditingNodeCount} 个节点</span>
                          <span className="rounded-full bg-stone-100 px-2 py-1 dark:bg-white/10">{canvasWorkflowEditingAiCount} 个生图节点</span>
                        </div>
                        <button
                          type="button"
                          onClick={replaceCanvasWorkflowManagerWithSelection}
                          className="flex h-8 items-center justify-center gap-1.5 rounded-[14px] border border-emerald-200/80 bg-emerald-50 px-3 text-[11px] font-black text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100 dark:hover:bg-emerald-400/16"
                          title="用当前框选的节点替换这个工作流的内部结构；内置工作流会保存为本地修改"
                        >
                          <LayoutGrid className="h-3.5 w-3.5" />
                          用当前选中覆盖结构
                        </button>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={deleteCanvasWorkflowFromManager}
                            disabled={!canvasWorkflowEditingCustom}
                            className="rounded-[15px] bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-300 dark:bg-red-400/10 dark:text-red-200 dark:hover:bg-red-400/16 dark:disabled:bg-stone-800 dark:disabled:text-stone-600"
                            title={canvasWorkflowEditingCustom ? '删除这个本地工作流修改' : '内置工作流还没有修改，不能删除'}
                          >
                            删除
                          </button>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={closeCanvasWorkflowManager}
                              className="rounded-[15px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              onClick={saveCanvasWorkflowManagerChanges}
                              className="rounded-[15px] bg-emerald-500 px-3 py-1.5 text-xs font-black text-white shadow-sm shadow-emerald-500/20 transition-colors hover:bg-emerald-400 dark:bg-emerald-400 dark:text-stone-950 dark:hover:bg-emerald-300"
                            >
                              保存修改
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  {isCanvasMode && canvasContextMenu && (
                    <div
                      data-no-drag="true"
                      data-canvas-floating-layer="true"
                      data-canvas-context-menu="true"
                      className="fixed z-[100080] min-w-[176px] rounded-[16px] border border-white/55 bg-stone-950/86 p-1.5 text-stone-100 shadow-[0_18px_46px_rgba(0,0,0,0.28)] backdrop-blur-2xl dark:border-stone-700/70"
                      style={{
                        left: Math.min(canvasContextMenu.x, window.innerWidth - 196),
                        top: Math.min(canvasContextMenu.y, window.innerHeight - 260),
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onWheel={(event) => event.stopPropagation()}
                    >
                      {(canvasContextMenu.type === 'canvas' || canvasContextMenu.type === 'item') && (
                        <>
                          {canvasContextMenu.type === 'canvas' && (
                            <>
                              <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/38">创建</div>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-cyan-500/18 hover:text-cyan-200"
                                onClick={() => {
                                  addCanvasAiGeneratorNodeAtWorld({ x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                                AI 生图节点
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-emerald-500/18 hover:text-emerald-200"
                                onClick={() => {
                                  addCanvasAiVideoGeneratorNodeAtWorld({ x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <Film className="h-3.5 w-3.5 text-emerald-300" />
                                AI 视频节点
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                onClick={() => {
                                  addCanvasTextItemAtWorld({ x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <Type className="h-3.5 w-3.5 text-amber-300" />
                                文字节点
                              </button>
                              {canvasClipboardRef.current.length > 0 && (
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                  onClick={() => {
                                    pasteCanvasItems({ x: canvasContextMenu.x, y: canvasContextMenu.y });
                                    setCanvasContextMenu(null);
                                  }}
                                >
                                  <Clipboard className="h-3.5 w-3.5 text-emerald-300" />
                                  粘贴
                                </button>
                              )}
                              <div className="my-1 h-px bg-white/10" />
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                onClick={() => {
                                  fitCanvasViewToItems();
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <Compass className="h-3.5 w-3.5 text-amber-300" />
                                适配全部
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                onClick={() => {
                                  organizeCanvasItems();
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <LayoutGrid className="h-3.5 w-3.5 text-cyan-300" />
                                一键整理
                              </button>
                            </>
                          )}
                          {canvasContextMenu.type === 'item' && (() => {
                            const actionIds = getCanvasActionIds(canvasContextMenu.itemId);
                            const target = canvasItemsById.get(canvasContextMenu.itemId || '');
                            const targetWorkflowGroup = getCanvasWorkflowGroup(target);
                            return (
                              <>
                                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/38">节点</div>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                  onClick={() => {
                                    copyCanvasItems(actionIds);
                                    setCanvasContextMenu(null);
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5 text-cyan-300" />
                                  复制
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                  onClick={() => {
                                    duplicateCanvasItems(actionIds, { x: canvasContextMenu.x, y: canvasContextMenu.y });
                                    setCanvasContextMenu(null);
                                  }}
                                >
                                  <Clipboard className="h-3.5 w-3.5 text-emerald-300" />
                                  复制一份
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                  onClick={() => {
                                    void downloadCanvasItemsByIds(actionIds);
                                    setCanvasContextMenu(null);
                                  }}
                                >
                                  <Download className="h-3.5 w-3.5 text-sky-300" />
                                  下载
                                </button>
                                {isCanvasAiGeneratorType(target?.ai?.type) && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-cyan-500/18 hover:text-cyan-200"
                                    onClick={() => {
                                      if (!target) return;
                                      void generateCanvasAiGeneratorNode(target.id);
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    {getCanvasAiMediaType(target?.ai) === 'video' ? <Film className="h-3.5 w-3.5 text-emerald-300" /> : <Sparkles className="h-3.5 w-3.5 text-cyan-300" />}
                                    {hasCanvasAiGeneratedResults(target) ? '再次生成' : '生成'}
                                  </button>
                                )}
                                {target?.ai?.type === 'workflow' && (
                                  <>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-emerald-500/18 hover:text-emerald-200"
                                      onClick={() => {
                                        void generateCanvasWorkflowModuleNode(target.id);
                                        setCanvasContextMenu(null);
                                      }}
                                    >
                                      <Link className="h-3.5 w-3.5 text-emerald-300" />
                                      {hasCanvasAiGeneratedResults(target) ? '再次运行工作流' : '运行工作流'}
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                      onClick={() => {
                                        expandCanvasWorkflowModuleForEdit(target.id);
                                        setCanvasContextMenu(null);
                                      }}
                                    >
                                      <Edit3 className="h-3.5 w-3.5 text-amber-300" />
                                      {hasCanvasAiGeneratedResults(target) ? '展开工作流' : '修改工作流'}
                                    </button>
                                  </>
                                )}
                                {targetWorkflowGroup && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-emerald-500/18 hover:text-emerald-200"
                                    onClick={() => {
                                      collapseCanvasWorkflowGroup(canvasContextMenu.itemId || '');
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    <Link className="h-3.5 w-3.5 text-emerald-300" />
                                    折叠工作流
                                  </button>
                                )}
                                {target?.ai?.type !== 'workflow' && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                    onClick={() => {
                                      updateCanvasSelection(actionIds);
                                      saveSelectedCanvasWorkflow();
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    <BookOpen className="h-3.5 w-3.5 text-violet-300" />
                                    保存为工作流
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                  onClick={() => {
                                    fitCanvasViewToItems(actionIds);
                                    setCanvasContextMenu(null);
                                  }}
                                >
                                  <Compass className="h-3.5 w-3.5 text-amber-300" />
                                  适配选中
                                </button>
                                {actionIds.length > 1 && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                    onClick={() => {
                                      organizeCanvasItems(actionIds);
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    <LayoutGrid className="h-3.5 w-3.5 text-cyan-300" />
                                    整理选中
                                  </button>
                                )}
                                <div className="my-1 h-px bg-white/10" />
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-red-300 transition-colors hover:bg-red-500/18"
                                  onClick={() => {
                                    const removedCount = removeCanvasItemsByIds(actionIds);
                                    if (removedCount > 0) showToast(`已删除 ${removedCount} 个画布元素`);
                                    setCanvasContextMenu(null);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  删除
                                </button>
                              </>
                            );
                          })()}
                        </>
                      )}
                      {canvasContextMenu.type === 'source-connection' && (() => {
                        const sourceIds = canvasContextMenu.sourceIds?.length
                          ? canvasContextMenu.sourceIds
                          : canvasContextMenu.sourceId
                            ? [canvasContextMenu.sourceId]
                            : [];
                        const targetNodes = canvasItems
                          .filter(item => canUseCanvasItemAsAiTarget(item) && !sourceIds.includes(item.id))
                          .slice(0, 6);
                        return (
                          <>
                            <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/38">连接到</div>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-cyan-500/18 hover:text-cyan-200"
                              onClick={() => {
                                addCanvasAiGeneratorNodeForSources(sourceIds, { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                setCanvasContextMenu(null);
                              }}
                            >
                              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                              新建 AI 生图节点
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-emerald-500/18 hover:text-emerald-200"
                              onClick={() => {
                                addCanvasAiVideoGeneratorNodeForSources(sourceIds, { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                setCanvasContextMenu(null);
                              }}
                            >
                              <Film className="h-3.5 w-3.5 text-emerald-300" />
                              新建 AI 视频节点
                            </button>
                            {targetNodes.length > 0 && (
                              <>
                                <div className="my-1 h-px bg-white/10" />
                                {targetNodes.map(target => (
                                  <button
                                    key={target.id}
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                    onClick={() => {
                                      connectCanvasItemsToGenerator(sourceIds, target.id);
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    {target.ai?.type === 'workflow'
                                      ? <Link className="h-3.5 w-3.5 text-emerald-300" />
                                      : getCanvasAiMediaType(target.ai) === 'video'
                                        ? <Film className="h-3.5 w-3.5 text-emerald-300" />
                                        : <Sparkles className="h-3.5 w-3.5 text-cyan-300" />}
                                    <span className="max-w-[138px] truncate">{target.ai?.presetLabel || target.item.name || getCanvasAiNodeTitle(target.ai)}</span>
                                  </button>
                                ))}
                              </>
                            )}
                          </>
                        );
                      })()}
                      {canvasContextMenu.type === 'target-input' && canvasContextMenu.targetId && (() => {
                        const target = canvasItemsById.get(canvasContextMenu.targetId || '');
                        const canUploadReferenceVideo = target?.ai?.type === 'video-generator' && target.ai.videoInputMode !== 'FLF';
                        return (
                        <>
                          <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/38">新增输入</div>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                            onClick={() => {
                              addCanvasTextInputForGenerator(canvasContextMenu.targetId || '', { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                              setCanvasContextMenu(null);
                            }}
                          >
                            <Type className="h-3.5 w-3.5 text-amber-300" />
                            文字说明
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                            onClick={() => {
                              const targetId = canvasContextMenu.targetId || '';
                              setCanvasContextMenu(null);
                              chooseLocalImagesForCanvasGenerator(targetId);
                            }}
                          >
                            <Upload className="h-3.5 w-3.5 text-cyan-300" />
                            上传图片
                          </button>
                          {canUploadReferenceVideo && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                              onClick={() => {
                                const targetId = canvasContextMenu.targetId || '';
                                setCanvasContextMenu(null);
                                void chooseLocalVideosForCanvasGenerator(targetId);
                              }}
                            >
                              <Film className="h-3.5 w-3.5 text-emerald-300" />
                              上传视频
                            </button>
                          )}
                        </>
                        );
                      })()}
                      {canvasContextMenu.type === 'connection' && (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-red-300 transition-colors hover:bg-red-500/18"
                          onClick={() => {
                            if (canvasContextMenu.targetId && canvasContextMenu.sourceId && removeCanvasConnection(canvasContextMenu.targetId, canvasContextMenu.sourceId)) {
                              showToast('已删除连接线');
                            }
                            setCanvasContextMenu(null);
                          }}
                        >
                          <Unplug className="h-3.5 w-3.5" />
                          删除连接线
                        </button>
                      )}
                    </div>
                  )}
                  {isCanvasMode && (
                    <div
                      data-no-drag="true"
                      data-canvas-toolbar="true"
                      className="absolute right-4 top-1/2 z-[100055] flex -translate-y-1/2 flex-col items-end gap-1.5 bg-transparent"
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        data-no-drag="true"
                        onClick={() => setIsCanvasNavigatorVisible(value => !value)}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-[0_8px_20px_rgba(15,23,42,0.10)] backdrop-blur-2xl transition-[transform,background-color,border-color] duration-200 hover:-translate-y-px hover:border-blue-300 hover:bg-blue-50/90 dark:border-white/10 dark:bg-stone-950/70 dark:text-blue-300 dark:hover:border-blue-400/30 dark:hover:bg-stone-900/90 ${
                          isCanvasNavigatorVisible ? 'border-blue-300 bg-blue-50/95 text-blue-600 ring-2 ring-blue-100/80 dark:border-blue-400/35 dark:bg-blue-400/12 dark:text-blue-200 dark:ring-blue-400/10' : 'border-blue-200/80 bg-white/88 text-blue-500'
                        }`}
                        title={isCanvasNavigatorVisible ? '隐藏导航' : '显示导航'}
                      >
                        <Compass className="h-3.5 w-3.5" />
                      </button>
                      {isCanvasNavigatorVisible && (
                        <div
                          data-no-drag="true"
                          className="absolute bottom-full right-0 z-[100070] mb-2 w-[220px] rounded-[20px] border border-white/60 bg-white/78 p-2.5 text-stone-700 shadow-[0_14px_36px_rgba(0,0,0,0.15)] backdrop-blur-2xl dark:border-stone-600/80 dark:bg-stone-900/88 dark:text-stone-200"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                          }}
                          onMouseDown={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          <div className="flex items-center justify-between gap-2 px-0.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-black">
                              <Compass className="h-3.5 w-3.5 text-blue-500 dark:text-blue-300" />
                              导航
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[10px] font-bold text-stone-400 dark:text-stone-500">
                                {canvasImageItemsForNav.length}
                              </span>
                              <button
                                type="button"
                                onClick={() => setIsCanvasNavigatorVisible(false)}
                                className="flex h-[18px] w-[18px] items-center justify-center rounded-[7px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                                title="隐藏导航"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          </div>
                          <div
                            className="relative mt-2 h-[116px] w-full overflow-hidden rounded-[14px] border border-blue-100/80 bg-blue-50/45 dark:border-stone-700/70 dark:bg-stone-950/45"
                            title="点击缩略图定位"
                          >
                            {canvasImageItemsForNav.length === 0 ? (
                              <div className="flex h-full items-center justify-center text-[10px] font-bold text-stone-400 dark:text-stone-500">
                                暂无图片
                              </div>
                            ) : canvasNavBounds && canvasImageItemsForNav.map(item => {
                              const left = 9 + (item.x - canvasNavBounds.left) * canvasNavScale;
                              const top = 9 + (item.y - canvasNavBounds.top) * canvasNavScale;
                              const width = Math.max(10, item.width * canvasNavScale);
                              const height = Math.max(10, item.height * canvasNavScale);
                              const selected = canvasSelectedIds.includes(item.id);
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  className={`absolute overflow-hidden rounded-[6px] border bg-white shadow-sm transition-transform hover:scale-110 dark:bg-stone-800 ${
                                    selected ? 'border-blue-500 ring-2 ring-blue-300/70' : 'border-white/85 dark:border-stone-600/80'
                                  }`}
                                  style={{ left, top, width, height }}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    centerCanvasItemInView(item, { select: true });
                                  }}
                                  title={item.item.name || item.item.content || '定位图片'}
                                >
                                  <img
                                    src={getCanvasItemNavSource(item.item)}
                                    alt={item.item.name || '导航缩略图'}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                    draggable={false}
                                  />
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const surface = canvasSurfaceRef.current;
                                if (surface) zoomCanvasAt(surface.getBoundingClientRect().left + surface.clientWidth / 2, surface.getBoundingClientRect().top + surface.clientHeight / 2, 360);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-[11px] bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                              title="缩小"
                            >
                              <Minimize2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                canvasScaleRef.current = 1;
                                applyCanvasScaleStyles(1, canvasSizeRef.current);
                                setCanvasScale(1);
                              }}
                              className="h-7 min-w-[58px] rounded-[11px] bg-stone-100 px-2 font-mono text-[10px] font-black text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                              title="重置缩放"
                            >
                              {Math.round(canvasScale * 100)}%
                            </button>
                            <button
                              type="button"
                              onClick={() => fitCanvasViewToItems(canvasSelectedIds.length > 0 ? canvasSelectedIds : undefined)}
                              className="flex h-7 w-7 items-center justify-center rounded-[11px] bg-cyan-100 text-cyan-700 transition-colors hover:bg-cyan-200 dark:bg-cyan-900/38 dark:text-cyan-300 dark:hover:bg-cyan-900/55"
                              title="适配全部 / 选中"
                            >
                              <LayoutGrid className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const surface = canvasSurfaceRef.current;
                                if (surface) zoomCanvasAt(surface.getBoundingClientRect().left + surface.clientWidth / 2, surface.getBoundingClientRect().top + surface.clientHeight / 2, -360);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-[11px] bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                              title="放大"
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => centerCanvasItemInView(getCanvasPrimaryImageItem(), { select: true })}
                              className="flex h-7 w-7 items-center justify-center rounded-[11px] bg-blue-100 text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/38 dark:text-blue-300 dark:hover:bg-blue-900/55"
                              title="定位最近图片"
                            >
                              <Compass className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => addCanvasAiGeneratorNode()}
                        className={`${CANVAS_SIDE_TOOL_CLASS} border-violet-200/80 hover:border-violet-300 hover:bg-violet-50/90 dark:hover:border-violet-400/30`}
                        title="新增 AI 生图节点"
                      >
                        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-300" />
                        <span className="min-w-0 flex-1 truncate text-left">图片</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => addCanvasAiVideoGeneratorNode()}
                        className={`${CANVAS_SIDE_TOOL_CLASS} border-emerald-200/80 hover:border-emerald-300 hover:bg-emerald-50/90 dark:hover:border-emerald-400/30`}
                        title="新增 AI 视频节点"
                      >
                        <Film className="h-3.5 w-3.5 shrink-0 text-emerald-500 dark:text-emerald-300" />
                        <span className="min-w-0 flex-1 truncate text-left">视频</span>
                      </button>
                      <RoundedSelect
                        data-no-drag="true"
                        data-canvas-edit-control="true"
                        value={CANVAS_AI_PROMPT_PRESET_PLACEHOLDER}
                        options={canvasAiPromptPresetSelectOptions}
                        onChange={(value) => {
                          if (value === CANVAS_AI_PROMPT_PRESET_ADD_VALUE) {
                            openCanvasPresetEditor();
                            return;
                          }
                          if (value === CANVAS_AI_PROMPT_PRESET_MANAGE_VALUE) {
                            openCanvasPresetManager();
                            return;
                          }
                          const preset = canvasAiPromptPresets.find(item => item.id === value);
                          if (preset) addCanvasAiGeneratorNode(undefined, preset);
                        }}
                        icon={<Palette className="h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-sky-300" />}
                        chevronClassName={`${CANVAS_SIDE_CHEVRON_FLOAT_CLASS} text-sky-500/80 dark:text-sky-300/80`}
                        labelClassName="text-left"
                        collapsedLabel="节点…"
                        expandedLabel="节点预设"
                        className={`${CANVAS_SIDE_SELECT_CLASS} border-sky-200/80 hover:border-sky-300 hover:bg-sky-50/90 dark:hover:border-sky-400/30`}
                        menuClassName="!z-[100080] !min-w-[230px] !rounded-[18px] !border-sky-100/80 !bg-white/97 !p-1.5 !text-[12px] !font-bold !text-stone-700 shadow-2xl shadow-black/16 dark:!border-sky-400/20 dark:!bg-stone-950/97 dark:!text-stone-100"
                        optionClassName="!rounded-[12px] !px-3 !py-2 hover:!bg-sky-50 hover:!text-sky-800 dark:hover:!bg-white/10 dark:hover:!text-white"
                        selectedOptionClassName="!bg-sky-50 !text-sky-800 dark:!bg-sky-400/12 dark:!text-sky-100"
                        title="选择节点预设"
                        menuMinWidth={230}
                      />
                      <RoundedSelect
                        data-no-drag="true"
                        data-canvas-edit-control="true"
                        value={CANVAS_WORKFLOW_SELECT_PLACEHOLDER}
                        options={canvasWorkflowSelectOptions}
                        onChange={(value) => {
                          if (value === CANVAS_WORKFLOW_SAVE_SELECTION_VALUE) {
                            saveSelectedCanvasWorkflow();
                            return;
                          }
                          if (value === CANVAS_WORKFLOW_MANAGE_VALUE) {
                            openCanvasWorkflowManager();
                            return;
                          }
                          const workflow = canvasWorkflowTemplates.find(item => item.id === value);
                          if (workflow) addCanvasWorkflowTemplate(workflow);
                        }}
                        icon={<Link className="h-3.5 w-3.5 shrink-0 text-teal-500 dark:text-teal-300" />}
                        chevronClassName={`${CANVAS_SIDE_CHEVRON_FLOAT_CLASS} text-teal-500/80 dark:text-teal-300/80`}
                        labelClassName="text-left"
                        collapsedLabel="工作…"
                        expandedLabel="工作流"
                        className={`${CANVAS_SIDE_SELECT_CLASS} border-teal-200/80 hover:border-teal-300 hover:bg-teal-50/90 dark:hover:border-teal-400/30`}
                        menuClassName="!z-[100080] !min-w-[250px] !rounded-[18px] !border-teal-100/80 !bg-white/97 !p-1.5 !text-[12px] !font-bold !text-stone-700 shadow-2xl shadow-black/16 dark:!border-teal-400/20 dark:!bg-stone-950/97 dark:!text-stone-100"
                        optionClassName="!rounded-[12px] !px-3 !py-2 hover:!bg-teal-50 hover:!text-teal-800 dark:hover:!bg-white/10 dark:hover:!text-white"
                        selectedOptionClassName="!bg-teal-50 !text-teal-800 dark:!bg-teal-400/12 dark:!text-teal-100"
                        title="选择或保存工作流"
                        menuMinWidth={250}
                      />
                      <button
                        type="button"
                        onClick={() => void runSelectedCanvasWorkflowModules()}
                        disabled={!canvasItems.some(item => item.ai?.type === 'workflow')}
                        className={`${CANVAS_SIDE_EXPAND_TOOL_CLASS} border-indigo-200/80 hover:border-indigo-300 hover:bg-indigo-50/90 dark:hover:border-indigo-400/30`}
                        title="运行选中的工作流模块"
                      >
                        <Send className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-300" />
                        <span className="flex min-w-0 flex-1 items-center overflow-hidden text-left">
                          <span className="shrink-0">运行</span>
                          <span className="shrink-0 group-hover/canvas-tool:hidden">…</span>
                          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 group-hover/canvas-tool:max-w-[44px] group-hover/canvas-tool:opacity-100">工作流</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => addCanvasTextItem()}
                        className={`${CANVAS_SIDE_TOOL_CLASS} border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/90 dark:hover:border-slate-400/30`}
                        title="添加文字卡片"
                      >
                        <Type className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-300" />
                        <span className="min-w-0 flex-1 truncate text-left">文字</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => organizeCanvasItems()}
                        disabled={canvasItems.length < 2}
                        className={`${CANVAS_SIDE_TOOL_CLASS} border-orange-200/80 hover:border-orange-300 hover:bg-orange-50/90 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:border-orange-400/30`}
                        title="一键整理画布；多选时只整理选中节点"
                      >
                        <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-orange-500 dark:text-orange-300" />
                        <span className="min-w-0 flex-1 truncate text-left">整理</span>
                      </button>
                    </div>
                  )}
                  {isCanvasMode && isCanvasGeneratedListVisible && (
                    <div
                      data-no-drag="true"
                      className="absolute bottom-4 left-4 z-[100050] flex max-h-[42vh] w-[292px] flex-col rounded-[20px] border border-white/60 bg-white/80 p-2.5 text-stone-700 shadow-[0_14px_36px_rgba(0,0,0,0.15)] backdrop-blur-2xl dark:border-stone-700/70 dark:bg-stone-900/78 dark:text-stone-200"
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onWheel={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-2 px-0.5">
                        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-black">
                          <ImageIcon className="h-3.5 w-3.5 text-cyan-500" />
                          <span>已生成</span>
                          <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 font-mono text-[9px] text-cyan-700 dark:bg-cyan-400/14 dark:text-cyan-200">
                            {canvasGeneratedItemsForList.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {canvasGeneratedItemsForList.length > 0 && (
                            <button
                              type="button"
                              onClick={() => fitCanvasViewToItems(canvasGeneratedItemsForList.map(entry => entry.canvasItem.id))}
                              className="flex h-[18px] w-[18px] items-center justify-center rounded-[7px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-cyan-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-cyan-200"
                              title="适配全部已生成内容"
                            >
                              <LayoutGrid className="h-2.5 w-2.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setIsCanvasGeneratedListVisible(false)}
                            className="flex h-[18px] w-[18px] items-center justify-center rounded-[7px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                            title="隐藏已生成列表"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 min-h-0 overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {canvasGeneratedItemsForList.length === 0 ? (
                          <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-stone-200/80 bg-white/52 text-center text-[10px] font-bold text-stone-400 dark:border-stone-700/70 dark:bg-stone-950/36 dark:text-stone-500">
                            <Sparkles className="h-4 w-4 text-cyan-400" />
                            暂无生成内容
                          </div>
                        ) : (
                          <div className="grid gap-1.5">
                            {canvasGeneratedItemsForList.map(generatedItem => {
                              const source = getCanvasItemNavSource(generatedItem.item);
                              const isPending = generatedItem.ai?.status === 'working' || !source;
                              const isError = generatedItem.ai?.status === 'error';
                              const prompt = (generatedItem.ai?.prompt || generatedItem.item.remark || '').trim();
                              const generatedAt = generatedItem.ai?.generatedAt || generatedItem.item.createdAt || 0;
                              return (
                                <div
                                  key={`canvas-generated-list-${generatedItem.id}`}
                                  role="button"
                                  tabIndex={0}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    centerCanvasItemInView(generatedItem.canvasItem, { select: true });
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key !== 'Enter' && event.key !== ' ') return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    centerCanvasItemInView(generatedItem.canvasItem, { select: true });
                                  }}
                                  className={`group/generated flex w-full cursor-pointer items-center gap-2 rounded-[14px] border p-1.5 text-left transition-colors ${
                                    canvasSelectedIds.includes(generatedItem.canvasItem.id)
                                      ? 'border-cyan-200 bg-cyan-50/76 dark:border-cyan-400/24 dark:bg-cyan-400/12'
                                      : 'border-white/70 bg-white/58 hover:bg-white/90 dark:border-stone-700/60 dark:bg-stone-950/28 dark:hover:bg-stone-800/70'
                                  }`}
                                  title={prompt || generatedItem.item.name || '定位已生成内容'}
                                >
                                  <div className="h-12 w-14 shrink-0 overflow-hidden rounded-[10px] bg-stone-900/8 dark:bg-white/8">
                                    {isPending || isError ? (
                                      <div className={`flex h-full w-full items-center justify-center ${isError ? 'bg-red-500/12 text-red-500' : 'bg-cyan-500/10 text-cyan-500'}`}>
                                        <Sparkles className={`h-4 w-4 ${isPending && !isError ? 'animate-pulse' : ''}`} />
                                      </div>
                                    ) : generatedItem.item.type === 'video' && source && !/^data:image\//i.test(source) ? (
                                      source ? (
                                        <video
                                          src={source}
                                          muted
                                          loop
                                          playsInline
                                          preload="metadata"
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-emerald-500">
                                          <Film className="h-4 w-4" />
                                        </div>
                                      )
                                    ) : (
                                      <img
                                        src={source}
                                        alt={generatedItem.item.name || '已生成图片'}
                                        loading="lazy"
                                        decoding="async"
                                        className="h-full w-full object-cover"
                                        draggable={false}
                                      />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black ${
                                        isError
                                          ? 'bg-red-100 text-red-600 dark:bg-red-400/16 dark:text-red-200'
                                          : isPending
                                            ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-400/16 dark:text-cyan-200'
                                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/16 dark:text-emerald-200'
                                      }`}>
                                        {isError ? '失败' : isPending ? '生成中' : '完成'}
                                      </span>
                                      <span className="truncate text-[10px] font-black text-stone-700 dark:text-stone-200">
                                        {generatedItem.item.name || (generatedItem.item.type === 'video' ? 'AI 视频' : 'AI 生图')}
                                      </span>
                                    </div>
                                    <div className="mt-0.5 truncate text-[9px] font-medium text-stone-400 dark:text-stone-500">
                                      {prompt || (isError ? getCanvasAiErrorSummary(generatedItem.ai?.error) : '无 Prompt 记录')}
                                    </div>
                                    <div className="mt-1 flex items-center justify-between gap-1">
                                      <span className="font-mono text-[9px] font-bold text-stone-400 dark:text-stone-500">
                                        {generatedAt ? new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          void downloadBufferItems([generatedItem.item]);
                                        }}
                                        className="flex h-5 w-5 items-center justify-center rounded-[8px] text-stone-400 opacity-0 transition-all hover:bg-cyan-100 hover:text-cyan-700 group-hover/generated:opacity-100 dark:hover:bg-cyan-400/14 dark:hover:text-cyan-200"
                                        title="下载"
                                      >
                                        <Download className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {isCanvasMode && !isCanvasGeneratedListVisible && (
                    <button
                      type="button"
                      data-no-drag="true"
                      onClick={() => setIsCanvasGeneratedListVisible(true)}
                      className="absolute bottom-4 left-4 z-[100050] flex h-9 items-center gap-1.5 rounded-full border border-white/45 bg-white/76 px-3 text-[11px] font-black text-cyan-700 shadow-[0_8px_20px_rgba(0,0,0,0.13)] backdrop-blur-xl transition-colors hover:bg-white dark:border-stone-700/70 dark:bg-stone-900/76 dark:text-cyan-200 dark:hover:bg-stone-800"
                      title="显示已生成列表"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      已生成 {canvasGeneratedItemsForList.length}
                    </button>
                  )}
                  {isCanvasMode && (
                    <button
                      type="button"
                      data-no-drag="true"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsCanvasChromeHidden(prev => !prev);
                        window.requestAnimationFrame(() => {
                          canvasSurfaceRef.current?.focus({ preventScroll: true });
                        });
                      }}
                      className="absolute bottom-4 right-4 z-[100050] flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-stone-950/42 text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-all hover:bg-stone-950/62 focus:outline-none focus:ring-2 focus:ring-emerald-300/80"
                      title={isCanvasChromeHidden ? '显示菜单栏 (Tab)' : '隐藏菜单栏，画布全屏 (Tab)'}
                    >
                      {isCanvasChromeHidden ? <Minimize2 className="h-[18px] w-[18px]" /> : <Maximize2 className="h-[18px] w-[18px]" />}
                    </button>
                  )}
                  {activeTab === 'notes' && (
                    <div className="flex-1 flex flex-col gap-3">
                      <div className="rounded-[24px] bg-white/75 dark:bg-stone-900/55 border border-white/80 dark:border-stone-700/60 px-4 py-3 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
                              <StickyNote className="w-4 h-4 text-amber-500" />
                              桌面便签
                            </div>
                            <p className="mt-1 text-[11px] leading-5 text-stone-500 dark:text-stone-400">
                              管理当前保存的桌面便签。便签窗口不会出现在任务栏；需要找回时可以在这里重新显示。
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              onClick={createBlankFloatingNote}
                              disabled={isCreatingBlankNote}
                              className="inline-flex items-center gap-1.5 rounded-[16px] bg-amber-100 px-3 py-2 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-900/35 dark:text-amber-300 dark:hover:bg-amber-900/55"
                              title={`快捷键：${noteShortcut}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              新增
                            </button>
                            <button
                              onClick={closeAllFloatingNotes}
                              disabled={openFloatingNoteCount === 0}
                              className="rounded-[16px] bg-stone-100 px-3 py-2 text-[11px] font-bold text-stone-600 transition-colors hover:bg-stone-200 disabled:opacity-45 disabled:hover:bg-stone-100 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                            >
                              全部删除
                            </button>
                          </div>
                        </div>
                      </div>

                      {openFloatingNoteEntries.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center rounded-[28px] border border-dashed border-stone-200 dark:border-stone-700/70 bg-white/45 dark:bg-stone-900/30 px-6 py-10 text-center text-stone-400 dark:text-stone-500">
                          <StickyNote className="w-8 h-8 mb-3 text-amber-400/80" />
                          <p className="text-xs font-bold text-stone-500 dark:text-stone-400">还没有保存的桌面便签</p>
                          <p className="mt-2 text-[11px] leading-5">回到素材页，鼠标悬停卡片后点击右上角的便签按钮即可固定到桌面。</p>
                        </div>
                      ) : (
                        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))' }}>
                          {openFloatingNoteEntries.map(({ label, snapshot }) => {
                            const itemName = snapshot?.name || snapshot?.content || '桌面便签';
                            const sourceItem = snapshot ? items.find(item => item.id === snapshot.itemId) : null;
                            const kindLabel = snapshot?.type === 'image' ? '图片便签' : snapshot?.type === 'text' ? '文字便签' : snapshot?.type === 'video' ? '视频便签' : '文件便签';
                            const thumb = snapshot?.thumbnail || snapshot?.url || (snapshot?.path && snapshot.type === 'image' ? convertFileSrc(snapshot.path) : '');
                            return (
                              <div key={label} className="rounded-[24px] bg-white/82 dark:bg-stone-900/62 border border-white/80 dark:border-stone-700/60 p-3 shadow-sm">
                                <div className="flex items-start gap-3">
                                  <button
                                    onClick={() => focusFloatingNote(label, snapshot)}
                                    className="h-14 w-14 shrink-0 overflow-hidden rounded-[18px] bg-stone-100 dark:bg-stone-800 border border-stone-200/60 dark:border-stone-700/60 flex items-center justify-center"
                                    title="显示便签"
                                  >
                                    {thumb ? (
                                      <img src={thumb} alt={itemName} loading="lazy" decoding="async" className="h-full w-full object-cover" draggable={false} />
                                    ) : snapshot?.type === 'text' ? (
                                      <Type className="w-5 h-5 text-amber-500" />
                                    ) : snapshot?.type === 'video' ? (
                                      <Film className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                      <FileIcon className="w-5 h-5 text-stone-400" />
                                    )}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-bold text-stone-800 dark:text-stone-100" title={itemName}>{itemName}</div>
                                    <div className="mt-1 flex items-center gap-1.5">
                                      <span className="rounded-full bg-amber-50 dark:bg-amber-900/25 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">{kindLabel}</span>
                                      <span className="text-[10px] text-stone-400 dark:text-stone-500">{label.replace('note_', '#')}</span>
                                    </div>
                                    {sourceItem ? (
                                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-stone-500 dark:text-stone-400">{sourceItem.remark || sourceItem.content || sourceItem.name || '来自抽屉卡片'}</p>
                                    ) : (
                                      <p className="mt-1 text-[11px] leading-4 text-amber-500">原卡片可能已删除，便签内容仍可显示。</p>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-3 flex gap-2">
                                  <button onClick={() => focusFloatingNote(label, snapshot)} className="flex-1 rounded-[16px] bg-stone-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white">显示</button>
                                  <button onClick={() => closeFloatingNoteByLabel(label)} className="rounded-[16px] bg-stone-100 px-3 py-2 text-[11px] font-bold text-stone-500 hover:bg-red-50 hover:text-red-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-red-900/25 dark:hover:text-red-300">关闭</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {activeTab === 'calendar' && (
                    <div className="mx-auto flex-1 flex w-full flex-col gap-3 origin-top" style={calendarPageStyle}>
                      <div className="rounded-[24px] bg-white/62 dark:bg-stone-900/46 border border-white/70 dark:border-stone-700/58 px-4 py-3 shadow-sm shadow-black/[0.02] backdrop-blur-xl">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
                              <CalendarDays className="w-4 h-4 text-stone-500 dark:text-stone-300" />
                              日历
                            </div>
                            <p className="mt-1 text-[11px] leading-5 text-stone-400 dark:text-stone-500">
                              {filteredCalendarEvents.length === 0 ? '还没有日程' : `${calendarOpenCount} 项待办 / ${filteredCalendarEvents.length} 项总计`}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <RoundedSelect
                              value={calendarTagFilter}
                              options={calendarTagOptions}
                              onChange={setCalendarTagFilter}
                              icon={<Tag className="h-3.5 w-3.5 shrink-0 text-stone-400" />}
                              className="h-8 max-w-[118px] rounded-full border border-stone-200/70 bg-white/72 pl-2.5 pr-2 text-[11px] font-bold text-stone-600 shadow-sm shadow-black/[0.02] hover:bg-white dark:border-stone-700/60 dark:bg-stone-800/60 dark:text-stone-200 dark:hover:bg-stone-800"
                              menuMinWidth={150}
                              title={`筛选：${calendarTagFilterLabel}`}
                            />
                            <button
                              onClick={jumpCalendarToday}
                              className="shrink-0 rounded-full bg-stone-900 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                            >
                              今天
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[28px] border border-white/70 bg-white/58 p-2.5 shadow-sm shadow-black/[0.02] backdrop-blur-xl dark:border-stone-700/58 dark:bg-stone-900/38">
                        <div className="mb-2.5 flex items-center justify-between px-1">
                          <button
                            type="button"
                            onClick={() => moveCalendarMonth(-1)}
                            className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-white/72 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                            title="上个月"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <div className="text-sm font-black text-stone-800 dark:text-stone-100">
                            {new Date(calendarMonth).getFullYear()}年 {new Date(calendarMonth).getMonth() + 1}月
                          </div>
                          <button
                            type="button"
                            onClick={() => moveCalendarMonth(1)}
                            className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-white/72 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                            title="下个月"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-stone-400/80 dark:text-stone-500">
                          {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                            <div key={day} className="py-1">{day}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {calendarMonthDays.map(day => {
                            const date = new Date(day);
                            const key = getLocalDateKey(day);
                            const dayEvents = calendarEventsByDay.get(key) || [];
                            const isCurrentMonth = date.getMonth() === new Date(calendarMonth).getMonth();
                            const isSelected = startOfLocalDay(day) === startOfLocalDay(calendarSelectedDate);
                            const isToday = startOfLocalDay(day) === startOfLocalDay(Date.now());
                            const visibleDayEvents = dayEvents.slice(0, 4);
                            const displayDay = !isCurrentMonth && date.getDate() === 1
                              ? `${date.getMonth() + 1}/${date.getDate()}`
                              : `${date.getDate()}`;
                            const dayMeta = getCalendarDayMeta(day);

                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  setCalendarSelectedDate(startOfLocalDay(day));
                                  setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1).getTime());
                                }}
                                className={`group/day flex min-h-[92px] flex-col rounded-[16px] border border-transparent px-0.5 py-1 text-left transition-colors ${
                                  isSelected
                                    ? 'text-stone-900 dark:text-stone-100'
                                    : 'text-stone-700 hover:bg-white/34 dark:text-stone-300 dark:hover:bg-stone-900/34'
                                } ${isCurrentMonth ? '' : 'opacity-38'}`}
                              >
                                <div className={`w-full rounded-[12px] border px-1 py-0.5 transition-colors ${
                                  isSelected
                                    ? 'border-stone-200 bg-white/92 dark:border-stone-600 dark:bg-stone-800/76'
                                    : 'border-transparent'
                                }`}>
                                  <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
                                    <span className={`shrink-0 text-[16px] font-black leading-[18px] ${isToday ? 'text-rose-500 dark:text-rose-300' : ''}`}>
                                      {displayDay}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-0.5">
                                      {dayMeta.isPublicRestDay && (
                                        <span className="rounded-full bg-rose-50 px-[3px] text-[8px] font-black leading-[13px] text-rose-500 dark:bg-rose-900/26 dark:text-rose-200">
                                          休
                                        </span>
                                      )}
                                      {isToday && (
                                        <span className="rounded-full bg-rose-50/70 px-[3px] text-[8px] font-black leading-[13px] text-rose-500/80 dark:bg-rose-900/22 dark:text-rose-200/80">
                                          今
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className={`mt-px h-3 overflow-hidden whitespace-nowrap text-[9px] font-semibold leading-3 ${
                                    dayMeta.isNamedDay
                                      ? 'text-stone-600 dark:text-stone-300'
                                      : 'text-stone-400 dark:text-stone-500'
                                  }`}>
                                    {dayMeta.label}
                                  </div>
                                </div>
                                <div className="mt-0.5 flex h-[54px] w-full min-w-0 flex-col gap-0.5 overflow-hidden">
                                  {visibleDayEvents.map(event => {
                                    const priority = normalizeSchedulePriority(event.schedule.priority);
                                    return (
                                      <span
                                        key={event.id}
                                        className={`block h-[13px] w-full overflow-hidden whitespace-nowrap rounded-[5px] border px-1 text-[8px] font-black leading-[13px] ${getCalendarMiniEventClass(event)}`}
                                        title={`${priority} ${event.title}`}
                                      >
                                        {formatCalendarPreviewTitle(event.title)}
                                      </span>
                                    );
                                  })}
                                  {visibleDayEvents.length === 0 && (
                                    <span
                                      className="block h-[13px]"
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-[26px] border border-white/70 bg-white/50 p-3 shadow-sm shadow-black/[0.02] backdrop-blur-xl dark:border-stone-700/58 dark:bg-stone-900/34">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-black text-stone-700 dark:text-stone-100">
                            <Clock className="h-4 w-4 text-stone-400" />
                            {formatScheduleDateLabel(calendarSelectedDate)}
                          </div>
                          <span className="rounded-full bg-white/64 px-2 py-0.5 text-[10px] font-bold text-stone-400 dark:bg-stone-800/58 dark:text-stone-500">
                            {selectedCalendarEvents.length === 0 ? '0 项' : `${selectedCalendarOpenCount}/${selectedCalendarEvents.length}`}
                          </span>
                        </div>
                        <div className="mb-3 flex items-center gap-2 rounded-[18px] border border-stone-200/58 bg-white/48 p-2 dark:border-stone-700/58 dark:bg-stone-950/22">
                          <input
                            value={calendarDraftText}
                            onChange={(e) => setCalendarDraftText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addCalendarScheduleItem();
                              }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            placeholder="添加日程..."
                            className="min-w-0 flex-1 bg-transparent px-1 text-xs font-bold text-stone-700 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500"
                          />
                          <RoundedSelect
                            value={calendarTargetNoteLabel}
                            options={calendarScheduleNoteOptions}
                            onChange={setCalendarTargetNoteLabel}
                            icon={<StickyNote className="h-3 w-3 shrink-0 text-stone-400" />}
                            className="max-w-[112px] shrink-0 rounded-full border border-stone-200 bg-white/70 px-2 py-1 text-[10px] font-black text-stone-500 hover:bg-white dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300 dark:hover:bg-stone-800"
                            menuMinWidth={150}
                            title="选择写入的日程便签"
                          />
                          <RoundedSelect
                            value={calendarDraftPriority}
                            options={SCHEDULE_PRIORITY_OPTIONS.map(priority => ({ value: priority, label: priority }))}
                            onChange={(next) => setCalendarDraftPriority(normalizeSchedulePriority(next))}
                            className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${getSchedulePriorityClass(calendarDraftPriority)}`}
                            menuMinWidth={58}
                            title="优先级"
                          />
                          <button
                            type="button"
                            onClick={addCalendarScheduleItem}
                            disabled={!calendarDraftText.trim()}
                            className="shrink-0 rounded-full bg-stone-900 p-1.5 text-white transition-colors hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white dark:disabled:bg-stone-800 dark:disabled:text-stone-600"
                            title="添加日程"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {selectedCalendarEvents.length === 0 ? (
                          <div className="rounded-[18px] border border-dashed border-stone-200/80 bg-white/34 px-4 py-6 text-center text-xs font-bold text-stone-400 dark:border-stone-700 dark:bg-stone-950/18 dark:text-stone-500">
                            这天还没有安排
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {selectedCalendarEvents.map(renderCalendarEvent)}
                          </div>
                        )}
                      </div>

                      {unscheduledCalendarEvents.length > 0 && (
                        <div className="rounded-[26px] border border-white/70 bg-white/42 p-3 shadow-sm shadow-black/[0.02] backdrop-blur-xl dark:border-stone-700/58 dark:bg-stone-900/28">
                          <div className="mb-2 flex items-center gap-2 text-xs font-black text-stone-600 dark:text-stone-300">
                            <StickyNote className="h-4 w-4 text-stone-400" />
                            未安排日期
                          </div>
                          <div className="space-y-2">
                            {unscheduledCalendarEvents.map(renderCalendarEvent)}
                          </div>
                        </div>
                      )}

                      {calendarEvents.length === 0 && (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-[28px] border border-dashed border-stone-200 bg-white/38 px-6 py-10 text-center text-stone-400 dark:border-stone-700 dark:bg-stone-900/22 dark:text-stone-500">
                          <CalendarDays className="mb-3 h-8 w-8 text-stone-300 dark:text-stone-600" />
                          <p className="text-xs font-bold text-stone-500 dark:text-stone-400">还没有日程</p>
                          <p className="mt-2 text-[11px] leading-5">打开文字便签，切到日程模式并添加日期后，这里会自动汇总。</p>
                        </div>
                      )}
                    </div>
                  )}
                  {!isUtilityActiveTab && items.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-stone-400 dark:text-stone-600 space-y-3 opacity-80 px-6">
                      <Download className="w-7 h-7 opacity-70" />
                      <div className="space-y-2 text-center">
                        <p className="text-xs font-bold text-stone-500 dark:text-stone-400">把灵感先丢进抽屉</p>
                        <p className="text-[11px] leading-5">拖入文件/图片/网页图 · {snipShortcut} 截图 · {textShortcut} 快速记录 · {searchShortcut} 搜索</p>
                        <p className="text-[11px] leading-5">
                          <span className="rounded-full bg-amber-100/70 px-2 py-0.5 font-mono font-black text-amber-700 dark:bg-amber-400/12 dark:text-amber-200">{canvasShortcut}</span>
                          <span className="ml-1.5">进入画布</span>
                        </p>
                        <p className="text-[11px] leading-5">侧边小条：悬停展开，按住左键经过不触发，Ctrl + 左键可移动位置。</p>
                        <p className="text-[11px] leading-5">悬浮方块：默认右下角，悬停 0.8s 展开，左键拖动位置，{triggerShortcut} 切换入口。</p>
                      </div>
                    </div>
                  )}
                  {!isUtilityActiveTab && items.length > 0 && displayItems.length === 0 && activeTab !== 'alchemy' && (
                    <div className="flex-1 flex flex-col items-center justify-center text-stone-400 dark:text-stone-600 space-y-3 opacity-80 px-6">
                      <Search className="w-7 h-7 opacity-70" />
                      <div className="space-y-2 text-center">
                        <p className="text-xs font-bold text-stone-500 dark:text-stone-400">当前分类没有匹配卡片</p>
                        <p className="text-[11px] leading-5">试试切到“全部”、清空搜索，或把素材拖到当前文件夹。</p>
                        <p className="text-[11px] leading-5">
                          也可以按 <span className="rounded-full bg-amber-100/70 px-2 py-0.5 font-mono font-black text-amber-700 dark:bg-amber-400/12 dark:text-amber-200">{canvasShortcut}</span> 进入画布整理参考。
                        </p>
                        <p className="text-[11px] leading-5">常用：右上角星标固定、备注便于搜索，多选可批量导出/移动/删除。</p>
                      </div>
                    </div>
                  )}
                  {items.length > 0 && activeTab === 'alchemy' && displayItems.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-stone-400 dark:text-stone-600 space-y-3 opacity-70">
                      <Sparkles className="w-7 h-7" />
                      <p className="text-xs text-center px-5 leading-5">还没有可炼金的图片灵感。拖入参考图、截图或粘贴图片后，就可以在这里生成 CMF 炼金卡。</p>
                    </div>
                  )}
                  {activeTab === 'alchemy' && displayItems.length > 0 && (
                    <div className="mb-3 rounded-[24px] bg-emerald-50/70 dark:bg-emerald-900/15 border border-emerald-100 dark:border-emerald-800/40 px-4 py-3 text-xs leading-5 text-emerald-800 dark:text-emerald-200">
                      炼金台：共 {alchemyCount} 张图片灵感，已分析 {finishedAlchemyCount} 张。未配置 AI 时只提取配色；配置 AI 后再生成 CMF、造型语言、材料建议和可借鉴判断。
                    </div>
                  )}
                  {!isUtilityActiveTab && displayItems.length > 0 && (
                    <div
                      className="grid gap-4 items-start"
                      style={activeTab === 'alchemy'
                        ? { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${ALCHEMY_CARD_WIDTH}px), 1fr))` }
                        : { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardWidth}px), 1fr))` }}
                    >
                      <AnimatePresence mode={activeTab === 'alchemy' ? 'sync' : 'popLayout'}>
                        {renderedDisplayItems.map(item => (
                          <div
                            key={item.id}
                            data-alchemy-card-id={item.id}
                            className={activeTab === 'alchemy' ? 'transition-opacity' : `${draggingItemId === item.id ? 'opacity-50 scale-[0.99]' : ''} transition-opacity`}
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                            onPointerDown={(e) => {
                              if (activeTab === 'alchemy') return;
                              if (e.shiftKey && !isSelectMode) {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsSelectMode(true);
                                handleDrawerItemSelect(item.id, e as unknown as React.MouseEvent);
                                return;
                              }
                              startDrawerItemPointerDrag(e, item.id);
                            }}
                          >
                            {activeTab === 'alchemy' ? (
                              <AlchemyDrawerCard
                                item={item as AlchemyBufferItem}
                                active={selectedAlchemyItemId === item.id}
                                onSelect={() => setSelectedAlchemyItemId(prev => prev === item.id ? null : item.id)}
                                onAlchemy={() => runAlchemyAnalysis(item as AlchemyBufferItem)}
                                onPreview={() => {
                                  const source = item.url || (item.path ? convertFileSrc(item.path) : '');
                                  if (source) openSelectedImagePreview(source);
                                }}
                                onRemove={() => {
                                  pushDrawerUndoSnapshot('删除炼金卡片');
                                  setItems(prev => prev.filter(i => i.id !== item.id));
                                }}
                                onDeleteAlchemy={() => deleteAlchemyOnly(item.id)}
                                showToast={showToast}
                                hasAiAnalysis={hasAiAnalysis}
                              />
                            ) : (
                              <>
                                <BufferItemCard
                                  item={item} cardWidth={cardWidth} mediaHeight={cardMediaHeight} isResizing={isResizingCards}
                                  onResizeStart={() => setIsResizingCards(true)} onResizeEnd={() => setIsResizingCards(false)}
                                  onResize={(w: number, h: number) => { setCardWidth(w); setCardMediaHeight(h); }}
                                  onRemove={() => {
                                    if (item.isQuickAccess) { showToast('⚠️ 已开启星标保护，请先取消星标再删除'); return; }

                                    if (item.type === 'image') {

                                      requestDeleteDrawerItems([item], { label: '删除图片' });

                                      return;

                                    }

                                    removeDrawerItemsFromDrawer([item], '删除卡片');
                                  }}
                                  onRemoveFromFolder={() => {
                                    pushDrawerUndoSnapshot('移出文件夹');
                                    setItems(prev => prev.map(i => i.id === item.id ? { ...i, folderId: undefined } : i));
                                  }}
                                  onTogglePin={() => {
                                    pushDrawerUndoSnapshot(item.isQuickAccess ? '取消快速访问' : '固定快速访问');
                                    setItems(prev => prev.map(i => i.id === item.id ? { ...i, isQuickAccess: !i.isQuickAccess } : i));
                                  }}
                                  onImageClick={(url: string) => openSelectedImagePreview(url)}
                                  onVideoClick={() => {
                                    if (item.path) setSelectedVideo({ url: convertFileSrc(item.path), path: item.path });
                                  }}
                                  isSelectMode={isSelectMode} isSelected={selectedIds.includes(item.id)}
                                  onToggleSelect={(event?: React.MouseEvent) => handleDrawerItemSelect(item.id, event)}
                                  onTextEditStart={beginDrawerTextEditUndo}
                                  onTextEditEnd={endDrawerTextEditUndo}
                                  onUpdateRemark={(id: string, newRemark: string, nextRemarks?: string[]) => {
                                    const cleanRemarks = Array.isArray(nextRemarks) ? nextRemarks.filter(Boolean) : undefined;
                                    pushDrawerUndoSnapshot('修改标签备注');
                                    setItems(prev => prev.map(i => i.id === id ? { ...i, remark: newRemark, remarks: cleanRemarks && cleanRemarks.length > 0 ? cleanRemarks : undefined } : i));
                                    if (item.type === 'text') broadcastFloatingNoteTitleUpdate(id, cleanRemarks?.[0] || newRemark.split(/\r?\n/)[0] || '');
                                  }}
                                  onUpdateText={(id: string, nextText: string) => {
                                    const text = nextText.trim();
                                    if (!text) { showToast('文本不能为空'); return; }
                                    setItems(prev => prev.map(i => {
                                      if (i.id !== id) return i;
                                      const urlLike = isProbablyUrl(text);
                                      if (urlLike) {
                                        return { ...i, type: 'text', content: text, name: '网址链接', url: text, path: text, isUrl: true } as BufferItem;
                                      }
                                      const current: any = i;
                                      return {
                                        ...i,
                                        type: 'text',
                                        content: text,
                                        name: current.isUrl || i.name === '网址链接' ? '文本片段' : i.name,
                                        url: undefined,
                                        path: undefined,
                                        sourceUrl: undefined,
                                        pageUrl: undefined,
                                        originalUrl: undefined,
                                        isUrl: false,
                                      } as BufferItem;
                                    }));
                                    broadcastFloatingNoteTextUpdate(id, text);
                                  }}
                                  onLiveTextChange={(id: string, nextText: string) => {
                                    setItems(prev => prev.map(i => i.id === id && i.type === 'text' ? { ...i, content: nextText } as BufferItem : i));
                                    broadcastFloatingNoteTextUpdate(id, nextText);
                                  }}
                                  showToast={showToast}
                                  onEnsureThumbnail={ensureMediaThumbnail}
                                  onCreateFloatingNote={createFloatingNote}
                                  showAlchemy={isAlchemyCandidate(item as AlchemyBufferItem)}
                                  onAlchemy={() => runAiAlchemyFromCard(item as AlchemyBufferItem)}
                                  preferFullImageSource={
                                    item.folderId === AI_GENERATED_FOLDER_ID ||
                                    String(item.sourceUrl || item.originalUrl || '').startsWith('data:image/')
                                  }
                                />
                              </>
                            )}
                          </div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                  {!isUtilityActiveTab && hasMoreDisplayItems && (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={loadMoreDisplayItems}
                        className="rounded-[18px] border border-stone-200/70 dark:border-stone-700/70 bg-white/76 dark:bg-stone-900/48 px-3 py-2 text-[11px] font-bold text-stone-500 dark:text-stone-400 shadow-sm backdrop-blur-xl transition-colors hover:bg-stone-100 dark:hover:bg-stone-800"
                      >
                        加载更多 {Math.min(displayItems.length, drawerRenderLimit + DRAWER_RENDER_BATCH_SIZE)} / {displayItems.length}
                      </button>
                    </div>
                  )}
                  {!isUtilityActiveTab && displayItems.length > 0 && (
                    <div className="mt-4 mb-1 rounded-[22px] bg-stone-50/70 dark:bg-stone-900/30 border border-stone-200/60 dark:border-stone-700/60 px-3 py-2 text-[11px] leading-5 text-stone-500 dark:text-stone-400">
                      提示：拖入文件/图片/网页图添加素材；{canvasShortcut} 进入画布；{triggerShortcut} 切换触发入口。
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {!isUtilityActiveTab && !showTextInput && (
                    <motion.button
                      initial={isShortcutReveal ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={isShortcutReveal ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                      onClick={handleOpenTextInput}
                      className="absolute bottom-6 right-6 z-[120] bg-blue-500 hover:bg-blue-600 text-white p-3.5 rounded-full shadow-[0_8px_16px_rgba(59,130,246,0.28)] transition-transform hover:scale-105 active:scale-95 will-change-transform"
                      title="写下灵感"
                    ><Edit3 className="w-5 h-5" /></motion.button>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showTextInput && (
                    <motion.div initial={isShortcutReveal ? false : { opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} transition={isShortcutReveal ? { duration: 0 } : { type: 'tween', duration: 0.2, ease: "easeOut" }} className="absolute bottom-6 left-6 right-6 z-50 bg-white/90 dark:bg-stone-800/90 backdrop-blur-2xl rounded-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.16)] border border-stone-200/60 dark:border-stone-700/60 p-4 flex flex-col gap-3 will-change-transform" onMouseDown={e => e.stopPropagation()}>
                      <div className="flex justify-between items-center px-1">
                        <span className="text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center gap-1.5"><Edit3 className="w-4 h-4 text-blue-500" /> 记录灵感</span>
                        <button onClick={handleCloseTextInput} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                      <textarea
                        autoFocus value={quickText} onChange={e => setQuickText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            commitQuickText();
                          }
                          if (e.key === 'Escape') handleCloseTextInput();
                        }}
                        placeholder={`随便写点什么...\n(Enter 提交，Shift+Enter 换行)`}
                        className="w-full bg-stone-50/50 dark:bg-stone-900/50 rounded-[20px] p-3 border border-stone-200/50 dark:border-stone-700/50 outline-none resize-none text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 h-24 focus:ring-2 focus:ring-blue-500/20 transition-all [&::-webkit-scrollbar]:hidden"
                      />
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] text-stone-400 font-mono font-medium">{quickText.length} 字</span>
                        <button
                          onClick={() => {
                            commitQuickText();
                          }}
                          disabled={!quickText.trim()}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-stone-200 dark:disabled:bg-stone-700 disabled:text-stone-400 text-white text-xs font-medium rounded-[16px] transition-colors shadow-sm disabled:shadow-none"
                        ><Send className="w-3.5 h-3.5" /> 保存</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showMoveFolderModal && (
                    <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} transition={{ type: 'tween', duration: 0.2, ease: "easeOut" }} className="absolute bottom-6 left-6 right-6 z-50 bg-white/90 dark:bg-stone-800/90 backdrop-blur-2xl rounded-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.16)] border border-stone-200/60 dark:border-stone-700/60 p-4 flex flex-col gap-3 will-change-transform" onMouseDown={e => e.stopPropagation()}>
                      <div className="flex justify-between items-center px-1">
                        <span className="text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center gap-1.5"><Move className="w-4 h-4 text-emerald-500" /> 移动 {selectedIds.length} 个卡片</span>
                        <button onClick={() => setShowMoveFolderModal(false)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                        <button
                          onClick={() => moveSelectedItemsToFolder(undefined)}
                          className="rounded-[16px] border border-stone-200/70 dark:border-stone-700/70 bg-stone-50/80 dark:bg-stone-900/40 px-3 py-2 text-left text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                        >主抽屉</button>
                        {folders.map(folder => (
                          <button
                            key={folder.id}
                            onClick={() => moveSelectedItemsToFolder(folder.id, folder.name)}
                            className="rounded-[16px] border border-emerald-100/80 dark:border-emerald-800/45 bg-emerald-50/70 dark:bg-emerald-900/20 px-3 py-2 text-left text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/35 transition-colors truncate"
                            title={folder.name}
                          >{folder.name}</button>
                        ))}
                      </div>
                      <div className="rounded-[18px] bg-stone-50/70 dark:bg-stone-900/35 border border-stone-200/60 dark:border-stone-700/60 p-2.5">
                        <div className="mb-2 text-[11px] font-bold text-stone-500 dark:text-stone-400">新建分类并移动</div>
                        <div className="flex gap-2">
                          <input
                            value={moveFolderName}
                            onChange={e => setMoveFolderName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); createFolderAndMoveSelected(); }
                              if (e.key === 'Escape') setShowMoveFolderModal(false);
                            }}
                            placeholder="新分类名称"
                            className="min-w-0 flex-1 bg-white/75 dark:bg-stone-800/75 rounded-[14px] px-3 py-2 border border-white/80 dark:border-stone-700/70 outline-none text-xs text-stone-700 dark:text-stone-200 placeholder:text-stone-400 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                          />
                          <button
                            onClick={createFolderAndMoveSelected}
                            disabled={!moveFolderName.trim()}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-stone-200 dark:disabled:bg-stone-700 disabled:text-stone-400 text-white text-xs font-medium rounded-[14px] transition-colors shadow-sm disabled:shadow-none"
                          ><FolderPlus className="w-3.5 h-3.5" /> 新建并移动</button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showFolderModal && (
                    <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} transition={{ type: 'tween', duration: 0.2, ease: "easeOut" }} className="absolute bottom-6 left-6 right-6 z-50 bg-white/90 dark:bg-stone-800/90 backdrop-blur-2xl rounded-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.16)] border border-stone-200/60 dark:border-stone-700/60 p-4 flex flex-col gap-3 will-change-transform" onMouseDown={e => e.stopPropagation()}>
                      <div className="flex justify-between items-center px-1">
                        <span className="text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center gap-1.5"><FolderPlus className="w-4 h-4 text-emerald-500" /> 新建文件夹</span>
                        <button onClick={() => setShowFolderModal(false)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                      <input
                        autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); handleAddFolder(); }
                          if (e.key === 'Escape') setShowFolderModal(false);
                        }}
                        placeholder="输入文件夹名称 (如：工作、装修灵感)..."
                        className="w-full bg-stone-50/50 dark:bg-stone-900/50 rounded-[20px] p-3 border border-stone-200/50 dark:border-stone-700/50 outline-none text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      />
                      <div className="flex justify-end px-1 mt-1">
                        <button
                          onClick={handleAddFolder}
                          disabled={!newFolderName.trim()}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-stone-200 dark:disabled:bg-stone-700 disabled:text-stone-400 text-white text-xs font-medium rounded-[16px] transition-colors shadow-sm disabled:shadow-none"
                        ><Check className="w-3.5 h-3.5" /> 创建</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
        </div>
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[9998] rounded-[30px] overflow-hidden bg-black/45 backdrop-blur-sm flex items-center justify-center p-5 pointer-events-auto"
            onPointerDown={(e) => {
              if (e.button === 0 && e.target === e.currentTarget) {
                closeSelectedImagePreview();
                return;
              }
              if (e.button === 2) startPreviewWindowDrag(e);
            }}
            onMouseDown={(e) => {
              if (e.button === 0 && e.target === e.currentTarget) {
                closeSelectedImagePreview();
                return;
              }
              if (e.button === 2) startPreviewWindowDrag(e);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-emerald-400/50 z-[10000] transition-colors" onMouseDown={e => e.stopPropagation()} onPointerDown={startResizingWidth} />
            <div className="absolute bottom-0 left-0 right-0 h-2 cursor-row-resize hover:bg-emerald-400/50 z-[10000] transition-colors" onMouseDown={e => e.stopPropagation()} onPointerDown={startResizingHeight} />
            <div className="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize hover:bg-emerald-400/50 z-[10001] transition-colors rounded-bl-[30px]" onMouseDown={e => e.stopPropagation()} onPointerDown={startResizingCorner} />
            <div className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize hover:bg-emerald-400/50 z-[10001] transition-colors rounded-br-[30px]" onMouseDown={e => e.stopPropagation()} onPointerDown={startResizingRightCorner} />

            <button
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); closeSelectedImagePreview(); }}
              className="absolute top-4 right-4 z-[10003] w-8 h-8 rounded-full bg-white dark:bg-stone-800 shadow-lg flex items-center justify-center text-stone-500 hover:text-red-500"
              title="关闭预览"
            >
              <X className="w-4 h-4" />
            </button>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="relative w-full h-full pointer-events-auto flex items-center justify-center overflow-hidden rounded-[26px]"
              onPointerDown={(e) => {
                if (e.button === 0 && e.target === e.currentTarget) {
                  closeSelectedImagePreview();
                  return;
                }
                if (e.button === 2) {
                  startPreviewWindowDrag(e);
                  return;
                }
              }}
              onMouseDown={(e) => {
                if (e.button === 0 && e.target === e.currentTarget) {
                  closeSelectedImagePreview();
                  return;
                }
                if (e.button === 2) {
                  startPreviewWindowDrag(e);
                  return;
                }
              }}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={(e) => {
                e.preventDefault();
                e.stopPropagation();
                flashSelectedImageZoom();
                setSelectedImageZoom(z => clamp(z + (e.deltaY < 0 ? 0.12 : -0.12), 0.25, 5));
              }}
            >
              <AnimatePresence>
                {showSelectedImageZoom && (
                  <motion.button
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onClick={() => { setSelectedImageZoom(1); setSelectedImagePan({ x: 0, y: 0 }); selectedImagePanRef.current = { x: 0, y: 0 }; flashSelectedImageZoom(); }}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[10002] rounded-full bg-white/90 dark:bg-stone-800/90 shadow-lg px-3 py-1 text-[11px] font-mono text-stone-600 dark:text-stone-200 hover:bg-white dark:hover:bg-stone-700"
                    title="重置缩放"
                  >
                    {Math.round(selectedImageZoom * 100)}%
                  </motion.button>
                )}
              </AnimatePresence>
              <img
                src={selectedImage}
                alt="图片预览"
                decoding="async"
                className="max-w-full max-h-full w-auto h-auto rounded-[28px] shadow-2xl object-contain bg-white/10 cursor-grab active:cursor-grabbing select-none"
                style={{
                  transform: selectedImageZoom === 1 && selectedImagePan.x === 0 && selectedImagePan.y === 0
                    ? 'none'
                    : `translate(${Math.round(selectedImagePan.x)}px, ${Math.round(selectedImagePan.y)}px) scale(${selectedImageZoom})`,
                  transformOrigin: 'center center',
                  imageRendering: 'auto',
                  backfaceVisibility: 'hidden',
                }}
                draggable={false}
                onPointerDown={(e) => {
                  if (e.button === 2) {
                    startPreviewWindowDrag(e);
                    return;
                  }
                  if (e.button === 0) {
                    startSelectedImagePanDrag(e);
                    return;
                  }
                  e.stopPropagation();
                }}
                onMouseDown={(e) => {
                  if (e.button === 2) {
                    startPreviewWindowDrag(e);
                    return;
                  }
                  if (e.button === 0) {
                    startSelectedImagePanDrag(e);
                    return;
                  }
                  e.stopPropagation();
                }}
                onContextMenu={(e) => e.preventDefault()}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedVideo && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 rounded-[30px] overflow-hidden z-[9998] bg-black/45 backdrop-blur-sm flex items-center justify-center p-5 pointer-events-auto"
            onMouseDown={() => setSelectedVideo(null)}
          >
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="relative w-full max-w-3xl" onMouseDown={e => e.stopPropagation()}>
              <button onClick={() => setSelectedVideo(null)} className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white dark:bg-stone-800 shadow-lg flex items-center justify-center text-stone-500 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
              <video src={selectedVideo.url || convertFileSrc(selectedVideo.path)} controls autoPlay className="w-full max-h-[calc(100vh-72px)] rounded-[28px] shadow-2xl bg-black" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCanvasExitPrompt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] rounded-[30px] overflow-hidden bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto" onPointerEnter={keepDrawerOpenByPointer} onPointerMove={keepDrawerOpenByPointer} onPointerLeave={handleFloatingLayerPointerLeave} onMouseDown={(event) => { if (event.button === 0) closeCanvasExitPrompt(); }}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-[360px] rounded-[28px] bg-white p-4 shadow-2xl border border-stone-200 dark:border-stone-700 dark:bg-stone-900" onMouseDown={(event) => event.stopPropagation()}>
              <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-stone-100">
                <LayoutGrid className="h-4 w-4 text-amber-500" />
                {canvasExitPromptStep === 'choice' ? '离开无限画布？' : '保存画布内容？'}
              </div>
              <p className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">
                {canvasExitPromptStep === 'choice'
                  ? `当前画布里有 ${canvasItems.length} 个元素。可以先切回抽屉，画布内容会保留，之后还能随时切回来继续整理。`
                  : `直接退出会清空当前画布。保存后会新建一个临时画布文件夹，并把这些内容存入抽屉。`}
              </p>
              {canvasExitPromptStep === 'choice' ? (
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeCanvasExitPrompt}
                    className="rounded-[16px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={requestDiscardCanvasMode}
                    className="rounded-[16px] bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/45"
                  >
                    直接退出
                  </button>
                  <button
                    type="button"
                    onClick={leaveCanvasToDrawer}
                    className="rounded-[16px] bg-blue-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-600"
                  >
                    切换到抽屉
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCanvasExitPromptStep('choice')}
                    className="rounded-[16px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                  >
                    返回
                  </button>
                  <button
                    type="button"
                    onClick={discardCanvasMode}
                    className="rounded-[16px] bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/45"
                  >
                    不保存退出
                  </button>
                  <button
                    type="button"
                    onClick={saveCanvasToDrawer}
                    className="rounded-[16px] bg-blue-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-600"
                  >
                    保存到临时文件夹
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {canvasFolderImportPrompt && (
          <motion.div
            data-canvas-floating-layer="true"
            initial={{ opacity: 0, scale: 0.96, x: -6 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: -6 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="fixed z-[100120] w-[286px] overflow-hidden rounded-[18px] border border-blue-200/70 bg-white/96 p-2.5 text-stone-700 shadow-2xl shadow-black/15 backdrop-blur-xl pointer-events-auto dark:border-blue-400/20 dark:bg-stone-950/96 dark:text-stone-100"
            style={{
              left: Math.min(canvasFolderImportPrompt.x, Math.max(78, window.innerWidth - 306)),
              top: Math.min(canvasFolderImportPrompt.y, Math.max(12, window.innerHeight - 430)),
            }}
            onPointerEnter={keepDrawerOpenByPointer}
            onPointerMove={keepDrawerOpenByPointer}
            onPointerLeave={handleFloatingLayerPointerLeave}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200">
                  <FolderOpen className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-black">{canvasFolderImportPrompt.folderName}</div>
                  <div className="text-[10px] font-medium text-stone-400 dark:text-stone-500">{canvasFolderPickerItems.length} 张图片</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCanvasFolderImportPrompt(null)}
                className="rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-red-300"
                title="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={confirmAddFolderImagesToCanvas}
              className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-[13px] bg-blue-500 text-[11px] font-black text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-blue-400"
            >
              <Plus className="h-3.5 w-3.5" />
              全部加入画布
            </button>

            <div className="mt-2 max-h-[320px] overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="grid grid-cols-3 gap-1.5">
                {canvasFolderPickerItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addFolderImagePickerItemToCanvas(item.id)}
                    className="group relative aspect-square overflow-hidden rounded-[12px] border border-stone-200/70 bg-stone-100 shadow-sm transition hover:border-blue-300 hover:ring-2 hover:ring-blue-200/70 dark:border-white/10 dark:bg-stone-900 dark:hover:border-blue-300/50 dark:hover:ring-blue-300/20"
                    title={item.name || item.content || '加入画布'}
                  >
                    <img
                      src={getCanvasItemDisplaySource(item)}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                    <span className="absolute inset-x-0 bottom-0 hidden bg-black/58 px-1 py-1 text-[9px] font-bold text-white group-hover:block">
                      <span className="block truncate">{item.name || item.content || '加入画布'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {canvasWorkflowSaveDraft && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] rounded-[30px] overflow-hidden bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto"
            onPointerEnter={keepDrawerOpenByPointer}
            onPointerMove={keepDrawerOpenByPointer}
            onPointerLeave={handleFloatingLayerPointerLeave}
            onMouseDown={(event) => { if (event.button === 0) closeCanvasWorkflowSaveDialog(); }}
          >
            <motion.form
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-[360px] rounded-[28px] bg-white p-4 shadow-2xl border border-stone-200 dark:border-stone-700 dark:bg-stone-900"
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                confirmSaveCanvasWorkflow();
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-stone-100">
                  <BookOpen className="h-4 w-4 text-emerald-500" />
                  保存工作流
                </div>
                <button
                  type="button"
                  onClick={closeCanvasWorkflowSaveDialog}
                  className="rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-red-300"
                  title="关闭"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">
                将当前选中的 {canvasWorkflowSaveDraft.nodes.length} 个节点封装成一个工作流模块，之后可右键模块再展开修改。
              </p>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-stone-400 dark:text-stone-500">名称</span>
                <input
                  data-no-drag="true"
                  autoFocus
                  value={canvasWorkflowSaveDraft.label}
                  maxLength={32}
                  onChange={(event) => setCanvasWorkflowSaveDraft(prev => prev ? { ...prev, label: event.target.value } : prev)}
                  placeholder={canvasWorkflowSaveDraft.defaultLabel}
                  className="h-10 w-full rounded-[16px] border border-stone-200/80 bg-stone-50/80 px-3 text-sm font-bold text-stone-700 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-200/55 dark:border-stone-700 dark:bg-stone-950/44 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-emerald-500/60 dark:focus:bg-stone-950 dark:focus:ring-emerald-900/35"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-black text-stone-500 dark:text-stone-400">
                <span className="rounded-full bg-stone-100 px-2 py-1 dark:bg-white/10">{canvasWorkflowSaveDraft.aiCount} 个生图节点</span>
                <span className="rounded-full bg-stone-100 px-2 py-1 dark:bg-white/10">{canvasWorkflowSaveDraft.externalInputIds.length} 个外部输入</span>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCanvasWorkflowSaveDialog}
                  className="rounded-[16px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!canvasWorkflowSaveDraft.label.trim()}
                  className="rounded-[16px] bg-emerald-500 px-3 py-1.5 text-xs font-black text-white shadow-sm shadow-emerald-500/20 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 dark:bg-emerald-400 dark:text-stone-950 dark:hover:bg-emerald-300 dark:disabled:bg-white/10 dark:disabled:text-white/35"
                >
                  保存并封装
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDialog.isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100220] rounded-[30px] overflow-hidden bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto" onPointerEnter={keepDrawerOpenByPointer} onPointerMove={keepDrawerOpenByPointer} onPointerLeave={handleFloatingLayerPointerLeave} onMouseDown={(event) => { if (event.button === 0) closeConfirmDialog(); }}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-[320px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-4" onMouseDown={(event) => event.stopPropagation()}>
              <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100">{confirmDialog.title || '确认操作'}</h3>
              <p className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{confirmDialog.message || '确定继续吗？'}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={closeConfirmDialog} className="px-3 py-1.5 rounded-[16px] text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">取消</button>
                {(confirmDialog.actions && confirmDialog.actions.length > 0
                  ? confirmDialog.actions
                  : [{
                    label: '确定',
                    onClick: confirmDialog.onConfirm,
                    className: 'rounded-[16px] bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600',
                  }]
                ).map((action, index) => (
                  <button
                    key={`${action.label}-${index}`}
                    onClick={() => {
                      void Promise.resolve(action.onClick()).catch((err) => {
                        console.warn('确认操作失败:', err);
                        showToast('操作失败');
                      });
                    }}
                    title={action.title}
                    className={action.className || 'rounded-[16px] bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600'}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQR && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9997] rounded-[30px] overflow-hidden bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto" onPointerEnter={keepDrawerOpenByPointer} onPointerMove={keepDrawerOpenByPointer} onPointerLeave={handleFloatingLayerPointerLeave} onMouseDown={() => { setShowQR(false); }}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-[300px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-5 text-center" onMouseDown={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5"><Smartphone className="w-4 h-4 text-emerald-500" /> 手机配对</span>
                <button onClick={() => { setShowQR(false); }} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="mx-auto w-fit p-3 rounded-[20px] bg-white">
                <QRCode value={mobilePairUrl || (localIP ? `http://${localIP}:1420/pair` : 'inspiration-drawer')} size={160} />
              </div>
              <p className="mt-3 text-xs text-stone-500 dark:text-stone-400 break-all">{mobilePairUrl ? `手机与电脑同一网络下扫码访问：${mobilePairUrl}` : (localIP ? `正在启动手机连接服务：${localIP}` : '正在获取本机 IP...')}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLaunchIntro && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22, delay: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-[9998] rounded-[30px] overflow-hidden bg-stone-950/35 backdrop-blur-xl flex items-center justify-center p-6 pointer-events-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.32, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              data-drawer-launch-intro="true"
              className="relative w-full max-w-[380px] overflow-hidden rounded-[32px] bg-white/92 dark:bg-stone-900/94 border border-white/70 dark:border-stone-700/70 shadow-2xl p-5"
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-stone-200/80 dark:bg-stone-700/80 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-amber-300 via-emerald-300 to-blue-300"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: STARTUP_CONSENT_DELAY_MS / 1000, ease: 'linear' }}
                />
              </div>

              <div className="flex items-start gap-3 pt-1">
                <div className="w-12 h-12 rounded-[20px] bg-amber-100/95 dark:bg-amber-200/90 border border-amber-200/80 flex items-center justify-center shadow-lg shadow-amber-200/30 shrink-0">
                  <LayoutGrid className="w-5 h-5 text-amber-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-300">Welcome Back</p>
                      <h2 className="mt-1 text-lg font-black text-stone-900 dark:text-stone-50">灵感抽屉 v3.0.2</h2>
                    </div>
                    <button onClick={(event) => finishLaunchIntro(event, false)} className="p-2 rounded-full text-stone-400 hover:text-red-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors" title="暂不同意免责声明">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">启动时从侧边滑出，15 秒后自动进入抽屉；未关闭即视为同意本软件免责声明。</p>
                </div>
              </div>

              <div className="mt-5 space-y-2.5 text-xs leading-5 text-stone-600 dark:text-stone-300">
                <div className="rounded-[20px] bg-stone-50/90 dark:bg-stone-800/70 border border-stone-100 dark:border-stone-700/70 p-3">
                  <p className="font-bold text-stone-800 dark:text-stone-100 mb-1">本次更新</p>
                  <p>画布里的本地参考图会先复制到用户缓存目录，再临时转换为可被 API 访问的 URL。</p>
                </div>
                <div className="rounded-[20px] bg-stone-50/90 dark:bg-stone-800/70 border border-stone-100 dark:border-stone-700/70 p-3">
                  <p className="font-bold text-stone-800 dark:text-stone-100 mb-1">免责说明</p>
                  <p>本软件不提供生图服务，只是 API 接口工具。</p>
                  <p className="mt-1">用户使用自己的 API 时，请遵守相关网站的用户协议。</p>
                  <p className="mt-1">关闭本弹窗表示暂不同意，15 秒未关闭或点击下方按钮视为同意。</p>
                </div>
              </div>

              <button onClick={(event) => finishLaunchIntro(event, true)} className="mt-5 w-full py-2.5 rounded-[22px] bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-black shadow-lg hover:scale-[1.01] active:scale-[0.98] transition-transform">
                同意并进入抽屉
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHelp && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 rounded-[30px] overflow-hidden z-[9997] bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto" onPointerEnter={keepDrawerOpenByPointer} onPointerMove={keepDrawerOpenByPointer} onPointerLeave={handleFloatingLayerPointerLeave} onMouseDown={() => setShowHelp(false)}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-[360px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-5" onMouseDown={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-blue-500" /> 使用说明</span>
                <button onClick={() => setShowHelp(false)} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="max-h-[62vh] overflow-y-auto pr-1 space-y-4 text-xs leading-5 text-stone-600 dark:text-stone-300 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-700 [&::-webkit-scrollbar-thumb]:rounded-full">
                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">基础功能</h3>
                  <p>把本地文件、图片、视频、PPT、文件夹拖进抽屉，可以作为临时素材暂存。文件夹只保存路径，不会展开里面的文件。</p>
                  <p>本地文件、图片和视频会复制到缓存路径，卡片右上角可复制、另存、在文件夹中显示；网页图片也会缓存为本地副本。</p>
                  <p>如果本地源文件还在，“在文件夹中显示”会优先定位原文件；源文件被删后会定位缓存副本。</p>
                  <p>点击图片进入大图预览；点击视频可以直接在抽屉里播放；点击普通文件会使用系统默认软件打开。卡片也可以拖出到支持文件拖放的应用。</p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">抽屉与触发入口</h3>
                  <p>抽屉支持“侧边小条”和“悬浮方块”两种入口，可在设置里切换，也可用 <span className="font-semibold">{triggerShortcut}</span> 快速切换。</p>
                  <p>侧边小条默认在右侧中间：悬停展开；按住左键经过不会误触发；<span className="font-semibold">Ctrl + 鼠标左键拖动</span> 可上下移动小条。</p>
                  <p>悬浮方块默认在右下角：悬停 0.8 秒展开；按住左键可拖动位置；拖入文件/网页图会自动展开抽屉。</p>
                  <p>拖动抽屉标题栏可以移动抽屉位置，移动后会自动进入钉住状态；点击右上角复位按钮后，抽屉会回到触发边并恢复自动缩回。</p>
                  <p>左边缘、底边和左下角可以拖动调整抽屉宽高；鼠标离开抽屉后，如果没有钉住或预览内容，抽屉会自动缩回。</p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">分类与整理</h3>
                  <p>左侧栏可以创建收纳夹，把卡片拖到收纳夹上即可归类。双击收纳夹名称可重命名，鼠标悬停可删除收纳夹。</p>
                  <p>进入多选模式后，可以批量导出到本地、移动到已有/新建分类文件夹，或批量删除。</p>
                  <p>文本卡片双击正文即可编辑；鼠标悬停任意卡片后按 <span className="font-semibold">Ctrl + C</span> 可直接复制该卡片内容。</p>
                  <p>搜索会同时匹配文件名、路径、文本内容和备注，适合快速找回临时素材。</p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">桌面便签</h3>
                  <p>鼠标悬停卡片后，点击右上角的便签按钮，可以把图片、文本、视频或文件固定成独立桌面便签；原卡片仍保留在抽屉里。</p>
                  <p>便签可以同时打开多个。单击并拖动便签非编辑区域可以移动位置；右下角手柄可调整窗口大小；滚轮可以缩放便签内容。</p>
                  <p>文字便签单击正文进入编辑，修改会同步回抽屉里的原文本卡片；悬浮按钮可切换颜色，也可转为日程便签。</p>
                  <p>右键便签可打开抽屉或关闭当前便签，鼠标进入便签时会显示置顶按钮；关闭后仍可在抽屉左侧便签栏重新显示。</p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">截图与手机传输</h3>
                  <p>点击相机按钮或使用截图快捷键后，框选区域即可截图。截图会先显示占位卡片，保存完成后自动替换成真实图片，并自动复制到剪贴板。</p>
                  <p>手机配对需要手机和电脑在同一局域网。打开二维码后，用手机 App 扫码连接，即可从手机发送文字、图片和文件到电脑抽屉。</p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">快捷键</h3>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">Alt + G</span>：切换防误触模式。开启后抽屉会锁定，避免鼠标靠边误触。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">F1</span>：快速截图。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">Alt + T</span>：打开快速文字记录。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">Alt + E</span>：新增桌面便签。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">{canvasShortcut}</span>：切换无限画布 / 普通抽屉。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">Alt + S</span>：打开搜索栏。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">Alt + Q</span>：切换侧边小条 / 悬浮方块。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">Ctrl + C</span>：鼠标悬停卡片时复制该卡片内容。</p>
                  <p>以上全局快捷键都可以在设置里重新录制和修改。</p>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showUpdateLog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9996] rounded-[30px] overflow-hidden bg-black/20 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto" onPointerEnter={keepDrawerOpenByPointer} onPointerMove={keepDrawerOpenByPointer} onPointerLeave={handleFloatingLayerPointerLeave} onMouseDown={closeUpdateLog}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-[360px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-5" onMouseDown={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-amber-500" /> 更新日志</span>
                <button onClick={closeUpdateLog} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-2 text-xs leading-5 text-stone-600 dark:text-stone-300">
                <p className="font-bold text-stone-800 dark:text-stone-100">v3.0.2 画布 AI 与 API 接口工具</p>
                <p>画布本地参考图会复制到用户设置的缓存目录下，再临时转换为可被 API 访问的 URL。</p>
                <p>生成结束后会关闭临时通道并删除临时文件。</p>
                <div className="rounded-[18px] border border-amber-200/80 bg-amber-50/80 p-3 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                  <p className="font-bold">免责说明</p>
                  <p className="mt-1">本软件不提供生图服务，只是 API 接口工具。用户使用自己的 API 时，请遵守相关网站的用户协议。</p>
                  <p className="mt-1">{isCloudflaredDisclaimerAccepted ? '当前已同意本软件免责声明。' : '点击下方按钮后，将视为同意本软件免责声明。'}</p>
                </div>
              </div>
              <button onClick={acceptUpdateLogAndClose} className="mt-4 w-full py-2 rounded-[20px] bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-bold">
                {isCloudflaredDisclaimerAccepted ? '知道了' : '同意并知道了'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const label = (appWindow as any).label;
  if (label === 'edge') return <EdgeTrigger />;
  if (label === 'snip') return <SnipOverlay />;
  if (label === 'note' || (typeof label === 'string' && label.startsWith('note_'))) {
    return (
      <React.Suspense fallback={null}>
        <LazyFloatingNoteHost
          getStoredDrawerSize={getStoredDrawerSize}
          getStoredTriggerMode={getStoredTriggerMode}
        />
      </React.Suspense>
    );
  }
  return <MainApp />;
}
