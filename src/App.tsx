// src/App.tsx
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  File as FileIcon, X, Download, Check, Pin, FolderOpen, Camera,
  Sun, RotateCcw, Settings, Image as ImageIcon, Type, Film, LayoutGrid,
  Compass, HardDrive, Monitor, BookOpen, Sparkles,
  CheckSquare, Trash2, Smartphone, Edit3, Send, Search, Power,
  ChevronDown, Palette, Keyboard, Plus, FolderPlus, Move, Link, StickyNote
} from 'lucide-react';
import QRCode from 'react-qr-code';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { isRegistered, register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen, emitTo } from '@tauri-apps/api/event';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { Image as TauriImage } from '@tauri-apps/api/image';
import { open } from '@tauri-apps/plugin-dialog';

import { Folder, BufferItem, TabType, FloatingNoteSnapshot, FloatingNoteScheduleItem } from './types';
import { SystemQuickAccessIcon } from './components/QuickIcons';
import BufferItemCard from './components/BufferItemCard';

const appWindow = getCurrentWindow();
const appWebview = getCurrentWebview();
const clearLegacyStartupFlags = () => {
  try {
    sessionStorage.removeItem('drawer_launch_intro_done');
    sessionStorage.removeItem('drawer_startup_preview_done');
    localStorage.removeItem('drawer_startup_preview_pending_at');
  } catch (_) {}
};

clearLegacyStartupFlags();

const isLaunchIntroDoneThisPage = () => (window as any).__drawerLaunchIntroDone === true;
const markLaunchIntroDoneThisPage = () => {
  (window as any).__drawerLaunchIntroDone = true;
};
type DrawerTabType = TabType | 'alchemy' | 'notes';

const TABS: { id: DrawerTabType; label: string; icon: any }[] = [
  { id: 'all', label: '全部', icon: LayoutGrid },
  { id: 'image', label: '图片', icon: ImageIcon },
  { id: 'text', label: '文本', icon: Type },
  { id: 'video', label: '视频', icon: Film },
  { id: 'file', label: '文件', icon: FileIcon },
  { id: 'alchemy', label: '炼金', icon: Sparkles },
];

const EDGE_WIDTH = 20;
const EDGE_STRIP_HEIGHT = 96;
const EDGE_HOVER_OPEN_DELAY = 140;
const DEFAULT_DRAWER_WIDTH = 400;
const DEFAULT_DRAWER_HEIGHT = 800;
const MIN_DRAWER_WIDTH = 240;
const MAX_DRAWER_WIDTH = Math.max(420, window.screen.availWidth - 120);
const MIN_DRAWER_HEIGHT = 220;
const MAX_DRAWER_HEIGHT = Math.max(500, window.screen.availHeight);
const DRAWER_ANIM_MS = 350;
const ALCHEMY_CARD_WIDTH = 340;
const FLOATING_NOTE_LABELS = Array.from({ length: 8 }, (_, idx) => `note_${idx + 1}`);
const OPEN_FLOATING_NOTES_STORAGE_KEY = 'drawer_open_floating_notes';
const FLOATING_NOTE_TEXT_BRIDGE_KEY = 'drawer_floating_note_text_bridge';
const FLOATING_NOTE_TITLE_BRIDGE_KEY = 'drawer_floating_note_title_bridge';
const FLOATING_NOTE_SOURCE_BRIDGE_KEY = 'drawer_floating_note_source_bridge';
type TextFloatingNoteSizeMode = 'large' | 'medium' | 'small';
const TEXT_FLOATING_NOTE_SIZES: Record<TextFloatingNoteSizeMode, { width: number; height: number; label: string }> = {
  large: { width: 360, height: 360, label: '默认' },
  medium: { width: 360, height: 56, label: '条状' },
  small: { width: 56, height: 56, label: '首字' },
};
const TEXT_FLOATING_NOTE_SIZE_ORDER: TextFloatingNoteSizeMode[] = ['large', 'medium', 'small'];
type TextFloatingNoteColorId = 'butter' | 'sage' | 'mist' | 'blush' | 'lilac' | 'linen' | 'white' | 'charcoal';
type TextFloatingNoteColorPreset = {
  id: TextFloatingNoteColorId;
  label: string;
  swatch: string;
  body: string;
  header: string;
  border: string;
  text: string;
  icon: string;
  darkBody: string;
  darkHeader: string;
  darkBorder: string;
  darkText: string;
  darkIcon: string;
};
const TEXT_FLOATING_NOTE_COLORS: TextFloatingNoteColorPreset[] = [
  { id: 'white', label: '白色', swatch: '#f7f7f3', body: '#fbfaf7', header: '#f1eee8', border: 'rgba(170, 164, 152, 0.34)', text: '#3f3d38', icon: '#8b867a', darkBody: '#2c2c2a', darkHeader: '#353532', darkBorder: 'rgba(180, 176, 166, 0.28)', darkText: '#f1eee7', darkIcon: '#c5c0b4' },
  { id: 'butter', label: '奶油黄', swatch: '#f3df9d', body: '#fff7d7', header: '#f5e5ad', border: 'rgba(205, 168, 76, 0.42)', text: '#5b4627', icon: '#b7791f', darkBody: '#2d281f', darkHeader: '#3a3022', darkBorder: 'rgba(202, 162, 86, 0.35)', darkText: '#f6e7bd', darkIcon: '#e7bf69' },
  { id: 'sage', label: '鼠尾草绿', swatch: '#d6e6ca', body: '#f0f6eb', header: '#dcebd3', border: 'rgba(141, 166, 126, 0.38)', text: '#354935', icon: '#6f8b5e', darkBody: '#202a23', darkHeader: '#2a352c', darkBorder: 'rgba(142, 166, 127, 0.32)', darkText: '#dcebd4', darkIcon: '#a6bf92' },
  { id: 'mist', label: '雾蓝', swatch: '#d7e8f0', body: '#eef7fb', header: '#dcecf3', border: 'rgba(119, 153, 171, 0.36)', text: '#314958', icon: '#6c95a8', darkBody: '#1f2930', darkHeader: '#273540', darkBorder: 'rgba(116, 154, 174, 0.32)', darkText: '#d8eaf2', darkIcon: '#99bfd0' },
  { id: 'blush', label: '淡粉', swatch: '#efd9d6', body: '#fbf1ef', header: '#f0ddda', border: 'rgba(180, 132, 128, 0.34)', text: '#563b3b', icon: '#b57373', darkBody: '#302525', darkHeader: '#3b2d2d', darkBorder: 'rgba(186, 139, 135, 0.3)', darkText: '#f0dcd9', darkIcon: '#d9aaa6' },
  { id: 'lilac', label: '浅藤紫', swatch: '#e4dcf0', body: '#f6f2fb', header: '#e8dff3', border: 'rgba(151, 132, 178, 0.34)', text: '#483d58', icon: '#8f7ab0', darkBody: '#292531', darkHeader: '#332d3d', darkBorder: 'rgba(156, 138, 184, 0.32)', darkText: '#e8def5', darkIcon: '#bdacd6' },
  { id: 'linen', label: '亚麻', swatch: '#e8ddcf', body: '#f8f3ec', header: '#ebe1d4', border: 'rgba(166, 143, 115, 0.34)', text: '#4d4237', icon: '#92785b', darkBody: '#2b2824', darkHeader: '#36312a', darkBorder: 'rgba(166, 143, 115, 0.3)', darkText: '#eadfce', darkIcon: '#c5aa88' },
  { id: 'charcoal', label: '深灰', swatch: '#3d3d3a', body: '#3f3f3c', header: '#4a4945', border: 'rgba(255, 255, 255, 0.14)', text: '#f2efe6', icon: '#d8d2c3', darkBody: '#222220', darkHeader: '#2c2c2a', darkBorder: 'rgba(255, 255, 255, 0.12)', darkText: '#f1eee6', darkIcon: '#d6d1c4' },
];

const getTextFloatingNoteColor = (colorId?: string) => (
  TEXT_FLOATING_NOTE_COLORS.find(color => color.id === colorId) || TEXT_FLOATING_NOTE_COLORS[0]
);

const resolveTextFloatingNoteSizeMode = (width?: number, height?: number): TextFloatingNoteSizeMode => {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return 'large';

  return TEXT_FLOATING_NOTE_SIZE_ORDER.reduce((best, mode) => {
    const bestSize = TEXT_FLOATING_NOTE_SIZES[best];
    const size = TEXT_FLOATING_NOTE_SIZES[mode];
    const bestDistance = Math.abs(bestSize.width - w) + Math.abs(bestSize.height - h);
    const distance = Math.abs(size.width - w) + Math.abs(size.height - h);
    return distance < bestDistance ? mode : best;
  }, 'large' as TextFloatingNoteSizeMode);
};

const floatingNoteStorageKey = (label = 'note_1') => `drawer_floating_note_${label}`;
const floatingNoteViewStorageKey = (itemId: string) => `drawer_floating_note_view_${itemId}`;

const readFloatingNoteViewState = (itemId?: string) => {
  if (!itemId) return {};
  try {
    const raw = localStorage.getItem(floatingNoteViewStorageKey(itemId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    return {
      zoom: Number.isFinite(Number(parsed.zoom)) ? clamp(Number(parsed.zoom), 0.45, 3) : undefined,
      width: Number.isFinite(Number(parsed.width)) ? clamp(Number(parsed.width), 220, 920) : undefined,
      height: Number.isFinite(Number(parsed.height)) ? clamp(Number(parsed.height), 160, 820) : undefined,
    };
  } catch (_) {
    return {};
  }
};

const writeFloatingNoteViewState = (itemId: string | undefined, patch: { zoom?: number; width?: number; height?: number }) => {
  if (!itemId) return {};
  const previous = readFloatingNoteViewState(itemId);
  const next = {
    ...previous,
    ...patch,
  };

  localStorage.setItem(floatingNoteViewStorageKey(itemId), JSON.stringify(next));
  return next;
};

const readOpenFloatingNoteLabels = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(OPEN_FLOATING_NOTES_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((label): label is string => typeof label === 'string' && FLOATING_NOTE_LABELS.includes(label))
      : [];
  } catch (_) {
    return [];
  }
};

const writeOpenFloatingNoteLabels = (labels: string[]) => {
  const next = Array.from(new Set(labels.filter(label => FLOATING_NOTE_LABELS.includes(label))));
  localStorage.setItem(OPEN_FLOATING_NOTES_STORAGE_KEY, JSON.stringify(next));
  return next;
};

const rememberOpenFloatingNoteLabel = (label: string) => writeOpenFloatingNoteLabels([...readOpenFloatingNoteLabels(), label]);

const forgetOpenFloatingNoteLabel = (label: string) => {
  writeOpenFloatingNoteLabels(readOpenFloatingNoteLabels().filter(item => item !== label));
};

const deleteFloatingNoteSnapshot = (label: string) => {
  const snapshot = readFloatingNoteSnapshot(label);
  forgetOpenFloatingNoteLabel(label);
  localStorage.removeItem(floatingNoteStorageKey(label));

  if (snapshot?.itemId) {
    const stillUsed = readOpenFloatingNoteLabels().some(otherLabel => {
      if (otherLabel === label) return false;
      return readFloatingNoteSnapshot(otherLabel)?.itemId === snapshot.itemId;
    });

    if (!stillUsed) {
      localStorage.removeItem(floatingNoteViewStorageKey(snapshot.itemId));
    }
  }

  return snapshot;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getStoredDrawerSize = () => ({
  width: clamp(Number(localStorage.getItem('drawer_width')) || DEFAULT_DRAWER_WIDTH, MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH),
  height: clamp(Number(localStorage.getItem('drawer_height')) || DEFAULT_DRAWER_HEIGHT, MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT),
});
const FLOAT_TRIGGER_SIZE = 56;
const FLOAT_HOVER_OPEN_DELAY = 800;
type TriggerMode = 'edge' | 'float';

const getStoredTriggerMode = (): TriggerMode => (
  localStorage.getItem('drawer_trigger_mode') === 'float' ? 'float' : 'edge'
);

const getStoredFloatPosition = () => {
  const left = (window.screen as any).availLeft || 0;
  const top = (window.screen as any).availTop || 0;
  const defaultX = left + Math.max(12, window.screen.availWidth - FLOAT_TRIGGER_SIZE - 24);
  const defaultY = top + Math.max(12, window.screen.availHeight - FLOAT_TRIGGER_SIZE - 24);
  const x = Number(localStorage.getItem('drawer_float_x'));
  const y = Number(localStorage.getItem('drawer_float_y'));
  return {
    x: Number.isFinite(x) ? x : defaultX,
    y: Number.isFinite(y) ? y : defaultY,
  };
};

const saveFloatPosition = (x: number, y: number) => {
  localStorage.setItem('drawer_float_x', String(Math.round(x)));
  localStorage.setItem('drawer_float_y', String(Math.round(y)));
};

const getStoredEdgeStripY = () => {
  const top = (window.screen as any).availTop || 0;
  const maxY = top + window.screen.availHeight - EDGE_STRIP_HEIGHT;
  const defaultY = top + Math.max(0, Math.round((window.screen.availHeight - EDGE_STRIP_HEIGHT) / 2));
  const y = Number(localStorage.getItem('drawer_edge_strip_y'));
  return clamp(Number.isFinite(y) ? y : defaultY, top, Math.max(top, maxY));
};

const saveEdgeStripY = (y: number) => {
  localStorage.setItem('drawer_edge_strip_y', String(Math.round(y)));
};

const decodeHtmlEntities = (value: string) => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
};

const normalizeDraggedUrl = (value: string) => {
  const firstLine = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || '';
  if (!firstLine) return '';
  return decodeHtmlEntities(firstLine).replace(/^['"]|['"]$/g, '').trim();
};

const extractImageUrlFromHtml = (html: string) => {
  if (!html) return '';
  const imgSrc = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  if (imgSrc) return normalizeDraggedUrl(imgSrc);
  const anyUrl = html.match(/https?:\/\/[^"'<>\s]+/i)?.[0];
  return anyUrl ? normalizeDraggedUrl(anyUrl) : '';
};

const getNameFromUrl = (url: string) => {
  if (url.startsWith('data:image/')) return `网页图片_${Date.now()}.png`;
  try {
    const parsed = new URL(url);
    const rawName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '网页图片');
    return rawName.includes('.') ? rawName : `${rawName || '网页图片'}_${Date.now()}`;
  } catch (_) {
    return `网页图片_${Date.now()}`;
  }
};

const isProbablyUrl = (value?: string | null) => /^https?:\/\/\S+$/i.test((value || '').trim());

const getFileExtension = (value?: string | null) => {
  const clean = (value || '').split('?')[0].split('#')[0];
  const name = clean.split(/[/\\]/).pop() || '';
  const ext = name.includes('.') ? name.split('.').pop() || '' : '';
  return ext.toLowerCase();
};

const getWebImageFromDataTransfer = (dt?: DataTransfer | null) => {

  if (!dt) return null;

  const downloadUrl = dt.getData('DownloadURL');
  if (downloadUrl) {
    const parts = downloadUrl.split(':');
    const url = parts.slice(2).join(':');
    const name = parts[1] || getNameFromUrl(url);
    if (url) return { url: normalizeDraggedUrl(url), name };
  }

  const htmlUrl = extractImageUrlFromHtml(dt.getData('text/html'));
  if (htmlUrl) return { url: htmlUrl, name: getNameFromUrl(htmlUrl) };

  const uriUrl = normalizeDraggedUrl(dt.getData('text/uri-list'));
  if (uriUrl) return { url: uriUrl, name: getNameFromUrl(uriUrl) };

  const mozUrl = normalizeDraggedUrl(dt.getData('text/x-moz-url'));
  if (mozUrl) return { url: mozUrl, name: getNameFromUrl(mozUrl) };

  const plainUrl = normalizeDraggedUrl(dt.getData('text/plain'));
  if (/^(https?:|data:image\/)/i.test(plainUrl)) {
    return { url: plainUrl, name: getNameFromUrl(plainUrl) };
  }

  return null;
};

type AlchemyState = 'raw' | 'analyzing' | 'alchemy' | 'error';

type AlchemyResult = {
  title?: string;
  colors: string[];
  keywords: string[];
  form: string;
  cmf: string;
  summary?: string;
  borrow: string[];
  avoid: string[];
  materials: string[];
  analysisMode?: 'palette' | 'ai' | 'mock';
  colorSource?: string;
  apiStatus?: string;
  generatedAt?: number;
};

type AlchemyData = {
  state: AlchemyState;
  note?: string;
  result?: AlchemyResult;
  createdAt?: number;
  analyzedAt?: number;
  error?: string;
};

type AlchemyBufferItem = BufferItem & {
  alchemy?: AlchemyData;
  isDirectory?: boolean;
  isUrl?: boolean;
};

type AiAnalysisConfig = {
  provider: string;
  endpoint: string;
  apiKey: string;
  model: string;
  proxy?: string;
};

const SILICONFLOW_DEFAULT_ENDPOINT = 'https://api.siliconflow.cn/v1';
const SILICONFLOW_DEFAULT_MODEL = 'Qwen/Qwen3-VL-32B-Instruct';
const SILICONFLOW_VISION_MODEL_FALLBACKS = [
  { value: 'Qwen/Qwen3-VL-32B-Instruct', label: 'Qwen3-VL-32B-Instruct（推荐：视觉 CMF）' },
  { value: 'Qwen/Qwen3-VL-32B-Thinking', label: 'Qwen3-VL-32B-Thinking（视觉推理）' },
  { value: 'Qwen/Qwen3-Omni-30B-A3B-Instruct', label: 'Qwen3-Omni-30B-Instruct（图像/视频/音频）' },
  { value: 'Qwen/Qwen3-Omni-30B-A3B-Thinking', label: 'Qwen3-Omni-30B-Thinking（多模态推理）' },
  { value: 'THUDM/GLM-4.1V-9B-Thinking', label: 'GLM-4.1V-9B-Thinking（视觉理解）' },
  { value: 'deepseek-ai/DeepSeek-OCR', label: 'DeepSeek-OCR（OCR / 文档视觉）' },
  { value: 'Qwen/Qwen2.5-VL-7B-Instruct', label: 'Qwen2.5-VL-7B（旧模型，若可用再选）' },
];
const SILICONFLOW_VISION_MODEL_LABELS: Record<string, string> = Object.fromEntries(
  SILICONFLOW_VISION_MODEL_FALLBACKS.map(model => [model.value, model.label])
);

const isSiliconFlowProvider = (provider: string) => provider === 'siliconflow';
const isSiliconFlowVisionModel = (model: string) => /(?:qwen\/?(?:2(?:\.5)?|3)[-_]?vl|qvq|qwen3[-_]?omni|glm.*(?:v|vision)|deepseek[-_]?vl|deepseek[-_]?ocr|step3|paddleocr[-_]?vl|vision|\bvl\b|omni|ocr)/i.test(model);

const ALCHEMY_PALETTES = [
  {
    colors: ['#e7dfd2', '#b8aea1', '#6f6a63', '#f0a45a'],
    keywords: ['低饱和', '暖灰金属', '柔和倒角', '家居科技'],
    materials: ['喷砂阳极氧化铝', '低光泽 PC/ABS', '细织物网布', '硅胶脚垫'],
  },
  {
    colors: ['#ebe7df', '#9aa0a3', '#5e696f', '#1f2528'],
    keywords: ['半透明', '轻科技', '层次感', '克制'],
    materials: ['烟灰透明 PC', '雾面银喷涂件', '黑色 TPU 密封圈', '半透磨砂纹理'],
  },
  {
    colors: ['#f1eadf', '#c9b8a2', '#8d7d6f', '#4b4038'],
    keywords: ['温暖', '织物', '弱科技感', '亲和'],
    materials: ['针织声学布', '暖灰磨砂 PC', '咖色橡胶', '微纹理喷涂'],
  },
  {
    colors: ['#e8ece9', '#aeb8b2', '#65736b', '#23312c'],
    keywords: ['冷静', '专业', '细节秩序', '耐用感'],
    materials: ['微砂纹喷涂', '雾面金属饰条', '防滑 TPU', '深灰阻燃 PC'],
  },
];

const isAlchemyCandidate = (item: AlchemyBufferItem) => (
  item.type === 'image' && !item.isDirectory && !!(item.url || item.path)
);

const getAlchemyState = (item: AlchemyBufferItem): AlchemyState => {
  if (!isAlchemyCandidate(item)) return item.alchemy?.state || 'raw';
  return item.alchemy?.state || 'raw';
};

const safeTextList = (values?: string[]) => (Array.isArray(values) ? values.filter(Boolean) : []);

const getAlchemySearchText = (item: AlchemyBufferItem) => {
  const result = item.alchemy?.result;
  return [
    item.name,
    item.content,
    item.remark,
    item.path,
    item.url,
    item.alchemy?.note,
    result?.title,
    result?.cmf,
    result?.form,
    ...safeTextList(result?.keywords),
    ...safeTextList(result?.borrow),
    ...safeTextList(result?.avoid),
    ...safeTextList(result?.materials),
  ].filter(Boolean).join(' ').toLowerCase();
};

const hashStringToIndex = (value: string, modulo: number) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % modulo;
};

const buildLocalAlchemyResult = (item: AlchemyBufferItem, apiStatus = 'ai-placeholder'): AlchemyResult => {
  const title = item.name || item.content || '参考图';
  const preset = ALCHEMY_PALETTES[hashStringToIndex(title, ALCHEMY_PALETTES.length)];
  return {
    title,
    colors: preset.colors,
    keywords: preset.keywords,
    form: `从「${title}」中提取到偏克制的体量关系：优先保留大面简洁、边缘柔和、局部细节形成记忆点的造型逻辑。`,
    cmf: `${preset.keywords[0]}方向：以 ${preset.colors[1]} / ${preset.colors[2]} 为主体层次，辅以低光泽材料和少量强调色，适合沉稳但有识别度的产品语言。`,
    summary: `${preset.keywords[0]}方向以克制配色和柔和细节形成识别感。`,
    borrow: ['借鉴主色和辅色的比例关系', '借鉴材质之间的粗细/冷暖对比', '借鉴局部细节作为记忆点，而不是照搬整体造型'],
    avoid: ['不要直接复制原图轮廓或装饰比例', '高亮点缀色需要克制使用', '若用于量产产品，需要重新评估耐脏、耐刮和装配分件线'],
    materials: preset.materials,
    analysisMode: 'mock',
    apiStatus,
    generatedAt: Date.now(),
  };
};

const hexFromRgb = (r: number, g: number, b: number) => (
  `#${[r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`
);

const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: h * 360, s, l };
};

const colorDistance = (a: [number, number, number], b: [number, number, number]) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const getPaletteImageSource = (item: AlchemyBufferItem) => {
  const raw = item.url || item.path || item.content || '';
  if (!raw) return '';
  if (/^(https?:|data:image\/|file:|asset:)/i.test(raw) || raw.includes('asset.localhost')) return raw;
  return convertFileSrc(raw);
};

const extractPaletteFromImageSource = (source: string): Promise<{ colors: string[]; keywords: string[]; colorSource: string }> => (
  new Promise((resolve, reject) => {
    if (!source) {
      reject(new Error('empty image source'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    let objectUrl = '';

    img.onload = () => {
      try {
        if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;
        if (!naturalW || !naturalH) throw new Error('invalid image size');

        const maxSide = 96;
        const scale = Math.min(1, maxSide / Math.max(naturalW, naturalH));
        const width = Math.max(1, Math.round(naturalW * scale));
        const height = Math.max(1, Math.round(naturalH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('canvas not available');

        ctx.drawImage(img, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height).data;
        const buckets = new Map<string, { count: number; r: number; g: number; b: number; sat: number; lum: number; warm: number; cool: number }>();

        for (let i = 0; i < pixels.length; i += 4) {
          const a = pixels[i + 3];
          if (a < 120) continue;
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if ((max > 248 && min > 245) || (max < 8 && min < 8)) continue;

          const qr = Math.round(r / 24) * 24;
          const qg = Math.round(g / 24) * 24;
          const qb = Math.round(b / 24) * 24;
          const key = `${qr},${qg},${qb}`;
          const hsl = rgbToHsl(r, g, b);
          const prev = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0, sat: 0, lum: 0, warm: 0, cool: 0 };
          prev.count += 1;
          prev.r += r;
          prev.g += g;
          prev.b += b;
          prev.sat += hsl.s;
          prev.lum += hsl.l;
          if (r > b + 18 && r >= g - 12) prev.warm += 1;
          if (b > r + 18 || g > r + 24) prev.cool += 1;
          buckets.set(key, prev);
        }

        const ranked = Array.from(buckets.values())
          .filter(bucket => bucket.count >= 2)
          .map(bucket => ({
            count: bucket.count,
            rgb: [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count] as [number, number, number],
            sat: bucket.sat / bucket.count,
            lum: bucket.lum / bucket.count,
            warm: bucket.warm,
            cool: bucket.cool,
          }))
          .sort((a, b) => b.count - a.count);

        const picked: typeof ranked = [];
        for (const bucket of ranked) {
          if (picked.every(existing => colorDistance(existing.rgb, bucket.rgb) > 42)) {
            picked.push(bucket);
          }
          if (picked.length >= 4) break;
        }

        if (picked.length === 0 && ranked.length > 0) picked.push(ranked[0]);
        const colors = picked.map(bucket => hexFromRgb(bucket.rgb[0], bucket.rgb[1], bucket.rgb[2]));
        const avgSat = picked.reduce((sum, item) => sum + item.sat, 0) / Math.max(1, picked.length);
        const avgLum = picked.reduce((sum, item) => sum + item.lum, 0) / Math.max(1, picked.length);
        const warm = picked.reduce((sum, item) => sum + item.warm, 0);
        const cool = picked.reduce((sum, item) => sum + item.cool, 0);
        const keywords = [
          avgSat < 0.2 ? '极简主义' : avgSat > 0.45 ? '活力感' : '现代感',
          avgLum > 0.72 ? '轻盈感' : avgLum < 0.34 ? '沉稳感' : '科技感',
          warm > cool * 1.15 ? '温暖家居' : cool > warm * 1.15 ? '冷静科技' : '中性克制',
          colors.length >= 4 ? '层次配色' : '核心色提取',
        ];

        resolve({ colors: colors.slice(0, 4), keywords, colorSource: 'local-canvas' });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('image load failed'));
    };

    const assignImageSource = async () => {
      try {
        // 本地文件/截图的 asset.localhost 地址先转成 blob URL，避免 Canvas 因跨源而无法读取像素。
        if (source.includes('asset.localhost') || source.startsWith('file:') || source.startsWith('asset:')) {
          const response = await fetch(source);
          if (response.ok) {
            const blob = await response.blob();
            objectUrl = URL.createObjectURL(blob);
            img.src = objectUrl;
            return;
          }
        }
      } catch (_) {}
      img.src = source;
    };

    void assignImageSource();
  })
);

const buildLocalPaletteOnlyResult = async (item: AlchemyBufferItem, apiStatus = 'local_palette'): Promise<AlchemyResult> => {
  const title = item.name || item.content || '参考图';
  const source = getPaletteImageSource(item);

  try {
    const palette = await extractPaletteFromImageSource(source);
    const colors = palette.colors.length > 0 ? palette.colors : ALCHEMY_PALETTES[0].colors;
    return {
      title,
      colors,
      keywords: palette.keywords,
      form: '',
      cmf: `${palette.keywords.slice(0, 2).join(' · ')}。`,
      summary: `以${palette.keywords.slice(0, 2).join('、')}为主，形成清晰的配色倾向。`,
      borrow: [],
      avoid: [],
      materials: [],
      analysisMode: 'palette',
      colorSource: palette.colorSource,
      apiStatus,
      generatedAt: Date.now(),
    };
  } catch (err) {
    const preset = ALCHEMY_PALETTES[hashStringToIndex(title, ALCHEMY_PALETTES.length)];
    return {
      title,
      colors: preset.colors,
      keywords: ['本地回退', '待重新分析', '可接入 AI'],
      form: '',
      cmf: '回退色板待重试',
      summary: '回退色板待重试',
      borrow: [],
      avoid: [],
      materials: [],
      analysisMode: 'palette',
      colorSource: 'fallback-preset',
      apiStatus: `${apiStatus}_fallback`,
      generatedAt: Date.now(),
    };
  }
};

function AlchemySwatches({ colors, compact = false }: { colors: string[]; compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {colors.slice(0, 4).map((color) => (
        <span
          key={color}
          className={`${compact ? 'h-5 w-5' : 'h-7 w-7'} rounded-full border border-black/10 dark:border-white/10 shadow-inner`}
          style={{ backgroundColor: color }}
          title={color}
        />
      ))}
    </div>
  );
}

function AlchemyDetailPanel({ result }: { result: AlchemyResult }) {
  const hasForm = !!result.form?.trim();
  const borrow = safeTextList(result.borrow);
  const avoid = safeTextList(result.avoid);
  const materials = safeTextList(result.materials);
  const keywords = safeTextList(result.keywords);
  const isPaletteOnly = result.analysisMode === 'palette' || (!hasForm && borrow.length === 0 && avoid.length === 0 && materials.length === 0);

  return (
    <div className="mt-3 space-y-3 rounded-[22px] bg-stone-50/80 dark:bg-stone-950/30 border border-stone-200/60 dark:border-stone-700/60 p-3">
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-stone-700 dark:text-stone-200"><Palette className="w-3.5 h-3.5 text-amber-500/85" /> {isPaletteOnly ? '本地配色分析' : 'CMF 判断'}</div>
        <p className="text-xs leading-5 text-stone-600 dark:text-stone-300">{result.cmf}</p>
      </div>
      <AlchemySwatches colors={result.colors} />
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((text) => (
            <span key={text} className="rounded-full bg-white/70 dark:bg-stone-900/60 border border-white/80 dark:border-stone-700/60 px-2 py-1 text-[10px] font-bold text-stone-600 dark:text-stone-300">{text}</span>
          ))}
        </div>
      )}

      {isPaletteOnly && (
        <div className="rounded-[18px] bg-stone-100/70 dark:bg-stone-900/45 border border-stone-200/70 dark:border-stone-700/60 px-3 py-2 text-[11px] leading-5 text-stone-600 dark:text-stone-300">
          未配置 AI 接口时只做本地色板提取；在设置里填写 AI 分析软件 API 后，再生成造型语言、材料建议、可借鉴点和不适合照搬点。
        </div>
      )}

      {hasForm && (
        <div>
          <div className="mb-1 text-[11px] font-bold text-stone-700 dark:text-stone-200">造型语言</div>
          <p className="text-xs leading-5 text-stone-600 dark:text-stone-300">{result.form}</p>
        </div>
      )}

      {(borrow.length > 0 || avoid.length > 0) && (
        <div className="grid gap-2 md:grid-cols-2">
          {borrow.length > 0 && (
            <div className="rounded-[18px] bg-white/70 dark:bg-stone-900/60 p-3 border border-white/80 dark:border-stone-700/60">
              <div className="mb-1 text-[11px] font-bold text-stone-700 dark:text-stone-200">可借鉴</div>
              <ul className="space-y-1 text-xs leading-5 text-stone-600 dark:text-stone-300">
                {borrow.map((text) => <li key={text}>· {text}</li>)}
              </ul>
            </div>
          )}
          {avoid.length > 0 && (
            <div className="rounded-[18px] bg-white/70 dark:bg-stone-900/60 p-3 border border-white/80 dark:border-stone-700/60">
              <div className="mb-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">不要照搬</div>
              <ul className="space-y-1 text-xs leading-5 text-stone-600 dark:text-stone-300">
                {avoid.map((text) => <li key={text}>· {text}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {materials.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {materials.map((text) => (
            <span key={text} className="rounded-full bg-stone-100/80 dark:bg-stone-900/45 border border-stone-200/70 dark:border-stone-700/60 px-2 py-1 text-[10px] font-bold text-stone-600 dark:text-stone-300">{text}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function AlchemyDrawerCard({
  item,
  active,
  onSelect,
  onAlchemy,
  onPreview,
  onRemove,
  onDeleteAlchemy,
  showToast,
  hasAiAnalysis,
}: {
  item: AlchemyBufferItem;
  active: boolean;
  onSelect: () => void;
  onAlchemy: () => void;
  onPreview: () => void;
  onRemove: () => void;
  onDeleteAlchemy: () => void;
  showToast: (msg: string) => void;
  hasAiAnalysis: boolean;
}) {
  const state = getAlchemyState(item);
  const result = item.alchemy?.result;
  const title = item.name || item.content || '参考图';
  const thumb = item.url || (item.path ? convertFileSrc(item.path) : '');
  const isDone = state === 'alchemy' && !!result;
  const isPaletteOnly = result?.analysisMode === 'palette';
  const actionLabel = isPaletteOnly ? 'AI 炼金' : (hasAiAnalysis ? 'AI 炼金' : '分析配色');
  const loadingLabel = isPaletteOnly ? 'AI 正在炼金...' : (hasAiAnalysis ? 'AI 正在炼金...' : '正在提取配色...');

  return (
    <motion.section
      layout={false}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ layout: { type: 'tween', duration: 0.24, ease: [0.16, 1, 0.3, 1] }, default: { type: 'tween', duration: 0.2, ease: [0.16, 1, 0.3, 1] } }}
      className={`rounded-[26px] border backdrop-blur-xl overflow-hidden shadow-sm transition-colors ${active ? 'bg-stone-900/95 dark:bg-stone-100/95 border-stone-900 dark:border-stone-100 text-white dark:text-stone-900' : 'bg-white/72 dark:bg-stone-800/72 border-white/70 dark:border-stone-700/60 text-stone-800 dark:text-stone-100'}`}
    >
      <div className="p-3">
        <div className="flex gap-3">
          <button onClick={onPreview} className="h-20 w-24 shrink-0 overflow-hidden rounded-[20px] bg-stone-100 dark:bg-stone-900 border border-black/5 dark:border-white/10 shadow-inner">
            {thumb ? <img src={thumb} className="h-full w-full object-cover" draggable={false} /> : <ImageIcon className="m-auto mt-7 h-5 w-5 text-stone-400" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{title}</div>
                <div className={`mt-1 text-[11px] ${active ? 'text-white/65 dark:text-stone-600' : 'text-stone-500 dark:text-stone-400'}`}>
                  {state === 'analyzing' ? loadingLabel : isDone ? (isPaletteOnly ? '配色分析卡' : 'CMF 炼金卡') : '普通灵感卡 · 待分析'}
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-white/10 dark:bg-stone-900/10 text-white/75 dark:text-stone-600' : 'bg-stone-100/85 dark:bg-stone-900/45 text-stone-500 dark:text-stone-300 border border-stone-200/60 dark:border-stone-700/50'}`}>{isDone ? (isPaletteOnly ? '配色' : 'CMF') : 'RAW'}</span>
            </div>
            {isDone && result ? (
              <div className="mt-2"><AlchemySwatches colors={result.colors} compact /></div>
            ) : (
              <p className={`mt-2 line-clamp-2 text-xs leading-5 ${active ? 'text-white/70 dark:text-stone-600' : 'text-stone-600 dark:text-stone-300'}`}>{item.remark || item.alchemy?.note || '图片已进入抽屉，可先查看配色，再继续 AI 炼金。'}</p>
            )}
          </div>
        </div>

        {isDone && result && (
          <p className={`mt-3 line-clamp-2 text-xs leading-5 ${active ? 'text-white/70 dark:text-stone-600' : 'text-stone-600 dark:text-stone-300'}`}>{isPaletteOnly ? (result.summary || '已完成本地配色分析，可继续 AI 炼金。') : result.cmf}</p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            onClick={state === 'analyzing' ? undefined : (isDone && !isPaletteOnly ? onSelect : onAlchemy)}
            disabled={state === 'analyzing'}
            className={`flex-1 rounded-[16px] px-3 py-2 text-xs font-bold transition-colors disabled:opacity-60 ${active ? 'bg-white/12 dark:bg-stone-900/10 text-white dark:text-stone-900 hover:bg-white/18 dark:hover:bg-stone-900/20' : 'bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white'}`}
          >
            {state === 'analyzing'
              ? (isPaletteOnly ? '炼金中...' : hasAiAnalysis ? '炼金中...' : '提取中...')
              : isDone
                ? (isPaletteOnly ? 'AI 炼金' : (active ? '收起详情' : '查看详情'))
                : actionLabel}
          </button>
          {isDone && !isPaletteOnly && (
            <button onClick={onAlchemy} className={`rounded-[16px] px-3 py-2 text-xs font-bold transition-colors ${active ? 'bg-white/10 dark:bg-stone-900/10 text-white/85 dark:text-stone-700 hover:bg-white/15 dark:hover:bg-stone-900/15' : 'bg-stone-100/85 dark:bg-stone-700/70 text-stone-600 dark:text-stone-200 hover:bg-stone-200/80 dark:hover:bg-stone-700'}`}>重炼</button>
          )}
          {item.alchemy ? (
            <button
              onClick={onDeleteAlchemy}
              className={`rounded-[16px] px-3 py-2 text-xs font-bold transition-colors ${active ? 'bg-white/10 dark:bg-stone-900/10 text-white/80 dark:text-stone-700 hover:bg-white/15 dark:hover:bg-stone-900/15' : 'bg-stone-100/85 dark:bg-stone-700/70 text-stone-500 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700'}`}
              title="只删除炼金结果，保留原图片卡片"
            >删除炼金</button>
          ) : (
            <button
              onClick={() => {
                if (item.isQuickAccess) { showToast('⚠️ 已开启星标保护，请先取消星标再删除'); return; }
                onRemove();
              }}
              className={`rounded-[16px] px-3 py-2 text-xs font-bold transition-colors ${active ? 'bg-white/10 dark:bg-stone-900/10 text-white/80 dark:text-stone-700 hover:bg-white/15 dark:hover:bg-stone-900/15' : 'bg-stone-100/85 dark:bg-stone-700/70 text-stone-500 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700'}`}
            >删除原图</button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {active && isDone && result && (
            <motion.div
              key="alchemy-detail-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <AlchemyDetailPanel result={result} />
            </motion.div>
          )}
        </AnimatePresence>
        {state === 'error' && item.alchemy?.error && (
          <div className="mt-3 rounded-[16px] bg-stone-100/80 dark:bg-stone-900/45 border border-stone-200/70 dark:border-stone-700/60 px-3 py-2 text-xs text-stone-600 dark:text-stone-300">{item.alchemy.error}</div>
        )}
      </div>
    </motion.section>
  );
}

function EdgeTrigger() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [triggerMode, setTriggerMode] = useState<TriggerMode>(() => getStoredTriggerMode());
  const triggerModeRef = useRef<TriggerMode>(triggerMode);
  const openingRef = useRef(false);
  const dragOpenBurstRef = useRef<number | null>(null);
  const startupPreviewDoneRef = useRef(false);
  const floatDragRef = useRef({ active: false, moved: false, lastX: 0, lastY: 0 });
  const [isFloatDragOverlay, setIsFloatDragOverlay] = useState(false);
  const [floatVisualPos, setFloatVisualPos] = useState(() => getStoredFloatPosition());
  const floatVisualPosRef = useRef(floatVisualPos);
  useEffect(() => { floatVisualPosRef.current = floatVisualPos; }, [floatVisualPos]);
  const [floatOverlayOrigin, setFloatOverlayOrigin] = useState({ x: 0, y: 0 });
  const floatOverlayOriginRef = useRef(floatOverlayOrigin);
  useEffect(() => { floatOverlayOriginRef.current = floatOverlayOrigin; }, [floatOverlayOrigin]);

  const [isAntiTouchMode, setIsAntiTouchMode] = useState(() => localStorage.getItem('drawer_anti_touch_mode') === 'true');
  const antiTouchRef = useRef(isAntiTouchMode);
  const floatHoverOpenTimerRef = useRef<number | null>(null);
  const edgeHoverOpenTimerRef = useRef<number | null>(null);
  const edgeStripDragRef = useRef({ active: false, moved: false, lastY: 0 });
  const leftButtonDownRef = useRef(false);
  useEffect(() => { antiTouchRef.current = isAntiTouchMode; }, [isAntiTouchMode]);

  const clearFloatHoverOpenTimer = () => {
    if (floatHoverOpenTimerRef.current !== null) {
      window.clearTimeout(floatHoverOpenTimerRef.current);
      floatHoverOpenTimerRef.current = null;
    }
  };

  const clearEdgeHoverOpenTimer = () => {
    if (edgeHoverOpenTimerRef.current !== null) {
      window.clearTimeout(edgeHoverOpenTimerRef.current);
      edgeHoverOpenTimerRef.current = null;
    }
  };

  useEffect(() => {
    const markLeftDown = (ev: MouseEvent | PointerEvent) => {
      if ('button' in ev && ev.button === 0) leftButtonDownRef.current = true;
    };
    const clearLeftDown = () => {
      leftButtonDownRef.current = false;
    };

    window.addEventListener('mousedown', markLeftDown, true);
    window.addEventListener('pointerdown', markLeftDown, true);
    window.addEventListener('mouseup', clearLeftDown, true);
    window.addEventListener('pointerup', clearLeftDown, true);
    window.addEventListener('pointercancel', clearLeftDown, true);
    window.addEventListener('blur', clearLeftDown, true);

    return () => {
      window.removeEventListener('mousedown', markLeftDown, true);
      window.removeEventListener('pointerdown', markLeftDown, true);
      window.removeEventListener('mouseup', clearLeftDown, true);
      window.removeEventListener('pointerup', clearLeftDown, true);
      window.removeEventListener('pointercancel', clearLeftDown, true);
      window.removeEventListener('blur', clearLeftDown, true);
    };
  }, []);

  // 悬浮方块窗口里彻底禁用右键菜单，避免右键拖动结束后弹出系统菜单。
  useEffect(() => {
    const preventContextMenu = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };

    window.addEventListener('contextmenu', preventContextMenu, true);
    document.addEventListener('contextmenu', preventContextMenu, true);

    return () => {
      window.removeEventListener('contextmenu', preventContextMenu, true);
      document.removeEventListener('contextmenu', preventContextMenu, true);
    };
  }, []);

  useEffect(() => { triggerModeRef.current = triggerMode; }, [triggerMode]);

  const refreshEdgeDropTargetsSoon = (delay = 220) => {
    // 悬浮方块/侧边小条尺寸切换后，WebView2 的子窗口 HWND 有时会重建。
    // 只在“定位完成后”刷新 edge 的 OLE DropTarget，不在拖入文件过程中刷新，避免卡住。
    window.setTimeout(() => {
      invoke('refresh_edge_drop_targets').catch(() => {});
    }, delay);
  };

  const positionTrigger = (mode = triggerModeRef.current) => {
    if (antiTouchRef.current) {
      invoke('hide_edge').catch(() => {});
      return;
    }

    const { height } = getStoredDrawerSize();
    if (mode === 'float') {
      const { x, y } = getStoredFloatPosition();
      invoke('position_edge', { height, mode, x, y })
        .then(() => refreshEdgeDropTargetsSoon())
        .catch(() => {});
    } else {
      const y = getStoredEdgeStripY();
      invoke('position_edge', { height, mode, y })
        .then(() => refreshEdgeDropTargetsSoon())
        .catch(() => {});
    }
  };

  const openDrawer = (force = false) => {
    clearEdgeHoverOpenTimer();
    if (antiTouchRef.current) return;
    if (openingRef.current && !force) return;
    openingRef.current = true;
    const { width, height } = getStoredDrawerSize();
    invoke('open_drawer', { width, height, mode: triggerModeRef.current })
      .catch(() => {})
      .finally(() => {
        window.setTimeout(() => { openingRef.current = false; }, 80);
      });
  };

  const scheduleFloatHoverOpen = (delay = 300, allowWhileLeftButtonDown = false) => {
    // 普通鼠标移动时，如果左键正按着，说明用户可能只是按住拖动经过悬浮方块，
    // 这种情况下不要自动弹出。文件拖拽会从 drag 事件进来，显式传 allow=true。
    if (
      antiTouchRef.current ||
      triggerModeRef.current !== 'float' ||
      floatDragRef.current.active ||
      (!allowWhileLeftButtonDown && leftButtonDownRef.current)
    ) return;
    clearFloatHoverOpenTimer();
    floatHoverOpenTimerRef.current = window.setTimeout(() => {
      floatHoverOpenTimerRef.current = null;
      if (!allowWhileLeftButtonDown && leftButtonDownRef.current) return;
      openDrawer(true);
    }, delay);
  };

  const hasBrowserImageDragData = (dt?: DataTransfer | null) => {
    if (!dt) return false;
    const types = Array.from(dt.types || []);

    // 从浏览器拖图片时，Chrome/Edge 常见类型是 DownloadURL 或 text/html；
    // 即使同时带有 Files，也要优先按网页图片处理，否则抽屉提前展开后会丢失 URL 数据。
    if (types.some(type => ['DownloadURL', 'text/html', 'text/x-moz-url'].includes(type))) return true;

    // 纯 URL 拖拽通常没有 Files；本地文件拖拽通常有 Files。
    if (!types.includes('Files') && types.some(type => ['text/uri-list', 'text/plain'].includes(type))) return true;

    return false;
  };

  const hasWebImageDragData = (dt?: DataTransfer | null) => hasBrowserImageDragData(dt);

  const sendWebDropToMain = (dt?: DataTransfer | null) => {
    const image = getWebImageFromDataTransfer(dt);
    const imageUrl = image?.url ? normalizeDraggedUrl(image.url) : '';

    // 浏览器拖图时经常同时带 DownloadURL/text/html 和一个临时 Files 路径。
    // 之前先处理 Files，会把浏览器/Tauri 默认临时路径当成本地文件保存，导致自定义缓存目录完全不生效。
    // 这里必须优先按网页图片 URL 处理，让 main 侧统一调用 cache_web_image_to_dir 写入用户设置的缓存目录。
    if (image?.url && /^(https?:|data:image\/)/i.test(imageUrl)) {
      emitTo('main', 'edge-web-image-dropped', image).catch(() => {});
      return;
    }

    const directPaths = Array.from(dt?.files || [])
      .map(file => (file as any).path as string | undefined)
      .filter((path): path is string => !!path);
    if (directPaths.length > 0) {
      emitTo('main', 'edge-files-dropped', directPaths).catch(() => {});
    }
  };

  const startDragOpenBurst = (dt?: DataTransfer | null) => {
    // 文件/网页图片拖拽时，鼠标事件通常不会触发；只要 edge 窗口收到任何拖拽事件，
    // 就连续调用几次 open_drawer，避免 Windows/WebView2 第一次事件被吞掉。
    void dt;
    if (antiTouchRef.current) return;
    clearFloatHoverOpenTimer();
    if (dragOpenBurstRef.current !== null) return;

    let count = 0;
    const tick = () => {
      if (antiTouchRef.current) {
        if (dragOpenBurstRef.current !== null) {
          window.clearInterval(dragOpenBurstRef.current);
          dragOpenBurstRef.current = null;
        }
        return;
      }
      openingRef.current = false;
      openDrawer(true);
      count += 1;
      if (count >= 16 && dragOpenBurstRef.current !== null) {
        window.clearInterval(dragOpenBurstRef.current);
        dragOpenBurstRef.current = null;
      }
    };

    tick();
    dragOpenBurstRef.current = window.setInterval(tick, 70);
  };

  useEffect(() => {
    const syncTheme = () => setIsDark(localStorage.getItem('theme') === 'dark');
    const syncAntiTouch = () => {
      const next = localStorage.getItem('drawer_anti_touch_mode') === 'true';
      setIsAntiTouchMode(next);
      antiTouchRef.current = next;
      if (next) {
        clearFloatHoverOpenTimer();
        clearEdgeHoverOpenTimer();
        if (dragOpenBurstRef.current !== null) {
          window.clearInterval(dragOpenBurstRef.current);
          dragOpenBurstRef.current = null;
        }
        invoke('hide_edge').catch(() => {});
      } else {
        window.setTimeout(() => positionTrigger(triggerModeRef.current), 30);
      }
    };
    const syncMode = () => {
      const next = getStoredTriggerMode();
      setTriggerMode(next);
      triggerModeRef.current = next;
      window.setTimeout(() => positionTrigger(next), 30);
    };

    window.addEventListener('storage', syncTheme);
    window.addEventListener('storage', syncMode);
    window.addEventListener('storage', syncAntiTouch);

    let unlistenMode: (() => void) | undefined;
    let unlistenTheme: (() => void) | undefined;
    let unlistenAntiTouch: (() => void) | undefined;
    let unlistenNativeDragEnter: (() => void) | undefined;
    listen('trigger-mode-changed', (event: any) => {
      const next = event.payload === 'float' ? 'float' : 'edge';
      localStorage.setItem('drawer_trigger_mode', next);
      setTriggerMode(next);
      triggerModeRef.current = next;
      window.setTimeout(() => positionTrigger(next), 30);
    }).then(f => unlistenMode = f);

    listen('theme-changed', (event: any) => {
      const next = event.payload === 'dark';
      localStorage.setItem('theme', next ? 'dark' : 'light');
      setIsDark(next);
    }).then(f => unlistenTheme = f);

    listen('anti-touch-changed', (event: any) => {
      const next = event.payload === true || event.payload === 'true';
      localStorage.setItem('drawer_anti_touch_mode', next ? 'true' : 'false');
      setIsAntiTouchMode(next);
      antiTouchRef.current = next;
      if (next) {
        clearFloatHoverOpenTimer();
        clearEdgeHoverOpenTimer();
        if (dragOpenBurstRef.current !== null) {
          window.clearInterval(dragOpenBurstRef.current);
          dragOpenBurstRef.current = null;
        }
        invoke('hide_edge').catch(() => {});
      } else {
        window.setTimeout(() => positionTrigger(triggerModeRef.current), 30);
      }
    }).then(f => unlistenAntiTouch = f);

    // Rust 原生 OLE DropTarget 发来的拖拽进入事件。
    // 这样网页图片和本地文件/文件夹都能触发展开，不再依赖 Tauri/WebView 内置拖拽。
    listen('native-drag-enter', () => {
      if (antiTouchRef.current) return;
      if (triggerModeRef.current === 'float') scheduleFloatHoverOpen(300, true);
      else startDragOpenBurst(null);
    }).then(f => unlistenNativeDragEnter = f);

    positionTrigger(getStoredTriggerMode());

    // 启动欢迎页现在完全交给 main 窗口控制。
    // 这里不要再从 edge 触发旧的“展开 -> 自动缩回”预览，否则会和 main 的欢迎页启动动画打架，
    // 表现成启动时先缩回、再被倒计时逻辑打开。
    if (!startupPreviewDoneRef.current) {
      startupPreviewDoneRef.current = true;
      clearLegacyStartupFlags();
    }

    const openFromNativeOrDomDrag = (event?: DragEvent) => {
      if (antiTouchRef.current) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
        }
        return;
      }

      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';

        const isDrop = event.type === 'drop';
        const isWebImageOnly = hasWebImageDragData(event.dataTransfer);

        if (triggerModeRef.current === 'float' && !isDrop) {
          scheduleFloatHoverOpen(300, true);
          return;
        }

        if (isDrop) {
          clearFloatHoverOpenTimer();
          sendWebDropToMain(event.dataTransfer);
          // 网页图片在 edge/悬浮方块上松手后再展开抽屉，避免抽屉打开后
          // edge 被隐藏，导致 drop 事件落到 main 原生拖拽层而丢失 URL 数据。
          startDragOpenBurst(event.dataTransfer);
          return;
        }

        // 本地文件/文件夹拖拽：立即展开 main，让 Tauri 原生 drop 事件拿到源路径。
        // 网页图片拖拽：不要提前展开，保留 edge 作为 DOM drop 目标。
        if (!isWebImageOnly) startDragOpenBurst(event.dataTransfer);
        return;
      }

      if (triggerModeRef.current === 'float') scheduleFloatHoverOpen(300, true);
      else startDragOpenBurst(null);
    };

    window.addEventListener('dragenter', openFromNativeOrDomDrag, true);
    window.addEventListener('dragover', openFromNativeOrDomDrag, true);
    window.addEventListener('drop', openFromNativeOrDomDrag, true);
    document.addEventListener('dragenter', openFromNativeOrDomDrag, true);
    document.addEventListener('dragover', openFromNativeOrDomDrag, true);
    document.addEventListener('drop', openFromNativeOrDomDrag, true);

    let unlistenPromise = appWebview.onDragDropEvent((event) => {
      if (antiTouchRef.current) return;
      const type = (event.payload as any).type;
      if (type === 'enter' || type === 'over') {
        if (triggerModeRef.current === 'float') scheduleFloatHoverOpen(300, true);
        else startDragOpenBurst();
      } else if (type === 'drop') {
        clearFloatHoverOpenTimer();
        const paths = (event.payload as any).paths as string[] | undefined;
        if (paths && paths.length > 0) {
          emitTo('main', 'edge-files-dropped', paths).catch(() => {});
        }
        startDragOpenBurst();
      }
    });

    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('storage', syncMode);
      window.removeEventListener('storage', syncAntiTouch);
      window.removeEventListener('dragenter', openFromNativeOrDomDrag, true);
      window.removeEventListener('dragover', openFromNativeOrDomDrag, true);
      window.removeEventListener('drop', openFromNativeOrDomDrag, true);
      document.removeEventListener('dragenter', openFromNativeOrDomDrag, true);
      document.removeEventListener('dragover', openFromNativeOrDomDrag, true);
      document.removeEventListener('drop', openFromNativeOrDomDrag, true);
      clearFloatHoverOpenTimer();
      clearEdgeHoverOpenTimer();
      if (dragOpenBurstRef.current !== null) {
        window.clearInterval(dragOpenBurstRef.current);
        dragOpenBurstRef.current = null;
      }
      if (unlistenMode) unlistenMode();
      if (unlistenTheme) unlistenTheme();
      if (unlistenAntiTouch) unlistenAntiTouch();
      if (unlistenNativeDragEnter) unlistenNativeDragEnter();
      unlistenPromise.then(unlisten => unlisten()).catch(() => {});
    };
  }, []);

  const isInsideVisibleEdgeStrip = (clientY: number) => {
    const stripHeight = 96;
    const centerY = window.innerHeight / 2;
    return Math.abs(clientY - centerY) <= stripHeight / 2;
  };

  const scheduleEdgeHoverOpen = (delay = EDGE_HOVER_OPEN_DELAY) => {
    // 普通鼠标悬停才展开；如果左键正按着经过小条，说明用户可能在拖选/拖动别的东西，不能误触发。
    if (antiTouchRef.current || triggerModeRef.current !== 'edge' || edgeStripDragRef.current.active || leftButtonDownRef.current) return;
    clearEdgeHoverOpenTimer();
    edgeHoverOpenTimerRef.current = window.setTimeout(() => {
      edgeHoverOpenTimerRef.current = null;
      if (edgeStripDragRef.current.active || antiTouchRef.current || triggerModeRef.current !== 'edge' || leftButtonDownRef.current) return;
      openDrawer(true);
    }, delay);
  };

  const handleEdgeMouseTouch = (e: React.MouseEvent | React.PointerEvent) => {
    if (antiTouchRef.current || edgeStripDragRef.current.active) return;
    if (e.ctrlKey) {
      // 按住 Ctrl 时进入“移动小条准备态”，不触发展开抽屉。
      clearEdgeHoverOpenTimer();
      return;
    }
    if ('buttons' in e && ((e.buttons & 1) === 1 || (e.buttons & 2) === 2)) {
      // 按住左键/右键经过侧边小条时不触发抽屉；文件拖拽会走 drag 事件单独展开。
      clearEdgeHoverOpenTimer();
      return;
    }
    // 普通悬停保留轻微延迟；Ctrl + 左键才允许移动小条。
    if (triggerModeRef.current === 'edge' && isInsideVisibleEdgeStrip(e.clientY)) scheduleEdgeHoverOpen();
  };

  const handleEdgeMouseLeave = () => {
    clearEdgeHoverOpenTimer();
  };

  useEffect(() => {
    const handleCtrlKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.ctrlKey) clearEdgeHoverOpenTimer();
    };
    window.addEventListener('keydown', handleCtrlKeyDown, true);
    document.addEventListener('keydown', handleCtrlKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleCtrlKeyDown, true);
      document.removeEventListener('keydown', handleCtrlKeyDown, true);
    };
  }, []);

  const startEdgeStripDrag = (e: React.PointerEvent | React.MouseEvent) => {
    if (antiTouchRef.current || triggerModeRef.current !== 'edge' || e.button !== 0 || !e.ctrlKey) return;
    clearEdgeHoverOpenTimer();
    e.preventDefault();
    e.stopPropagation();

    if (edgeStripDragRef.current.active) return;

    const startScreenY = e.screenY;
    const startY = getStoredEdgeStripY();
    const top = (window.screen as any).availTop || 0;
    const maxY = top + window.screen.availHeight - EDGE_STRIP_HEIGHT;
    let disposed = false;
    let moved = false;
    let latestY = startY;
    let frame: number | null = null;

    const applyPosition = () => {
      frame = null;
      const { height } = getStoredDrawerSize();
      void invoke('position_edge', { height, mode: 'edge', y: latestY })
        .then(() => refreshEdgeDropTargetsSoon(80))
        .catch(() => {});
    };

    const requestApplyPosition = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(applyPosition);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
      window.removeEventListener('pointercancel', handleCancel, true);
      window.removeEventListener('mousemove', handleMove, true);
      window.removeEventListener('mouseup', handleUp, true);
      document.removeEventListener('pointermove', handleMove, true);
      document.removeEventListener('pointerup', handleUp, true);
      document.removeEventListener('pointercancel', handleCancel, true);
      document.removeEventListener('mousemove', handleMove, true);
      document.removeEventListener('mouseup', handleUp, true);
    };

    const finishDrag = () => {
      if (disposed) return;
      disposed = true;
      cleanup();
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      saveEdgeStripY(latestY);
      edgeStripDragRef.current = { active: false, moved, lastY: latestY };
      applyPosition();
    };

    const handleMove: EventListener = (ev) => {
      if (disposed) return;
      const me = ev as PointerEvent | MouseEvent;
      if ('buttons' in me && (me.buttons & 1) !== 1) {
        finishDrag();
        return;
      }
      const dy = me.screenY - startScreenY;
      if (!moved && Math.abs(dy) < 3) return;
      ev.preventDefault();
      ev.stopPropagation();
      moved = true;
      latestY = clamp(startY + dy, top, Math.max(top, maxY));
      edgeStripDragRef.current = { active: true, moved: true, lastY: latestY };
      requestApplyPosition();
    };

    const handleUp: EventListener = (ev) => {
      if (disposed) return;
      ev.preventDefault();
      ev.stopPropagation();
      finishDrag();
    };

    const handleCancel: EventListener = (ev) => {
      if (disposed) return;
      ev.preventDefault();
      ev.stopPropagation();
      finishDrag();
    };

    edgeStripDragRef.current = { active: true, moved: false, lastY: startY };

    try {
      const pointerEvent = e as React.PointerEvent;
      const target = e.currentTarget as HTMLElement;
      if ('pointerId' in pointerEvent && target && 'setPointerCapture' in target) {
        target.setPointerCapture(pointerEvent.pointerId);
      }
    } catch (_) {}

    window.addEventListener('pointermove', handleMove, true);
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('pointercancel', handleCancel, true);
    window.addEventListener('mousemove', handleMove, true);
    window.addEventListener('mouseup', handleUp, true);
    document.addEventListener('pointermove', handleMove, true);
    document.addEventListener('pointerup', handleUp, true);
    document.addEventListener('pointercancel', handleCancel, true);
    document.addEventListener('mousemove', handleMove, true);
    document.addEventListener('mouseup', handleUp, true);
  };

  const handleEdgeFileDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (antiTouchRef.current) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      return;
    }

    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';

    const isDrop = e.type === 'drop';
    const isWebImageOnly = hasWebImageDragData(e.dataTransfer);

    if (triggerModeRef.current === 'float' && !isDrop) {
      scheduleFloatHoverOpen(300, true);
      return;
    }

    if (isDrop) {
      clearFloatHoverOpenTimer();
      sendWebDropToMain(e.dataTransfer);
      startDragOpenBurst(e.dataTransfer);
      return;
    }

    if (!isWebImageOnly) startDragOpenBurst(e.dataTransfer);
  };

  const handleFloatHoverEnter = (e?: React.MouseEvent | React.PointerEvent) => {
    if (e && 'buttons' in e && (e.buttons & 1) === 1) return;
    // 普通鼠标悬停需要停留 0.8s 才展开；文件拖拽仍保持更快响应。
    scheduleFloatHoverOpen(FLOAT_HOVER_OPEN_DELAY, false);
  };

  const handleFloatHoverLeave = () => {
    clearFloatHoverOpenTimer();
  };

  const startFloatDrag = (e: React.PointerEvent | React.MouseEvent) => {
    // 悬浮方块：左键单击打开，左键按住拖动。
    // 这里不用原生 startDragging；透明小窗口下它容易失效。
    // 改成直接移动 edge 窗口，并用 pointer capture 保持拖动连续。
    if (antiTouchRef.current || e.button !== 0 || triggerModeRef.current !== 'float') return;
    clearFloatHoverOpenTimer();
    e.preventDefault();
    e.stopPropagation();

    if (floatDragRef.current.active) return;

    const startScreenX = e.screenX;
    const startScreenY = e.screenY;
    const startLogical = getStoredFloatPosition();
    const scale = window.devicePixelRatio || 1;

    let disposed = false;
    let moved = false;
    let latestLogical = { ...startLogical };
    let frame: number | null = null;

    const clampToScreen = (x: number, y: number) => {
      const left = (window.screen as any).availLeft || 0;
      const top = (window.screen as any).availTop || 0;
      const right = left + window.screen.availWidth - FLOAT_TRIGGER_SIZE;
      const bottom = top + window.screen.availHeight - FLOAT_TRIGGER_SIZE;
      return {
        x: clamp(x, left, Math.max(left, right)),
        y: clamp(y, top, Math.max(top, bottom)),
      };
    };

    const applyLatestPosition = () => {
      frame = null;
      if (disposed) return;
      void appWindow.setPosition(new PhysicalPosition(
        Math.round(latestLogical.x * scale),
        Math.round(latestLogical.y * scale)
      ));
    };

    const requestApplyPosition = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(applyLatestPosition);
    };

    const cleanupListeners = () => {
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
      window.removeEventListener('pointercancel', handleCancel, true);
      window.removeEventListener('mousemove', handleMove, true);
      window.removeEventListener('mouseup', handleUp, true);
      document.removeEventListener('pointermove', handleMove, true);
      document.removeEventListener('pointerup', handleUp, true);
      document.removeEventListener('pointercancel', handleCancel, true);
      document.removeEventListener('mousemove', handleMove, true);
      document.removeEventListener('mouseup', handleUp, true);
    };

    const finishDrag = () => {
      if (disposed) return;
      disposed = true;
      cleanupListeners();

      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
        void appWindow.setPosition(new PhysicalPosition(
          Math.round(latestLogical.x * scale),
          Math.round(latestLogical.y * scale)
        ));
      }

      saveFloatPosition(latestLogical.x, latestLogical.y);
      floatVisualPosRef.current = latestLogical;
      setFloatVisualPos(latestLogical);
      setIsFloatDragOverlay(false);
      setFloatOverlayOrigin({ x: 0, y: 0 });
      floatDragRef.current = { active: false, moved: false, lastX: 0, lastY: 0 };

      void invoke('position_edge', {
        height: FLOAT_TRIGGER_SIZE,
        mode: 'float',
        x: latestLogical.x,
        y: latestLogical.y,
      })
        .then(() => refreshEdgeDropTargetsSoon())
        .catch(() => {});
    };

    const finishAsClick = () => {
      if (disposed) return;
      disposed = true;
      cleanupListeners();
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      setIsFloatDragOverlay(false);
      setFloatOverlayOrigin({ x: 0, y: 0 });
      floatDragRef.current = { active: false, moved: false, lastX: 0, lastY: 0 };
      openDrawer(true);
    };

    const handleMove: EventListener = (ev) => {
      if (disposed) return;
      const me = ev as PointerEvent | MouseEvent;

      if ('buttons' in me && (me.buttons & 1) !== 1) {
        handleUp(ev);
        return;
      }

      const dx = me.screenX - startScreenX;
      const dy = me.screenY - startScreenY;
      const distance = Math.hypot(dx, dy);
      if (!moved && distance < 3) return;

      ev.preventDefault();
      ev.stopPropagation();

      moved = true;
      floatDragRef.current.moved = true;
      latestLogical = clampToScreen(startLogical.x + dx, startLogical.y + dy);
      requestApplyPosition();
    };

    const handleUp: EventListener = (ev) => {
      if (disposed) return;
      ev.preventDefault();
      ev.stopPropagation();

      if (moved) finishDrag();
      else finishAsClick();
    };

    const handleCancel: EventListener = (ev) => {
      if (disposed) return;
      ev.preventDefault();
      ev.stopPropagation();
      finishDrag();
    };

    floatDragRef.current = {
      active: true,
      moved: false,
      lastX: e.screenX,
      lastY: e.screenY,
    };
    setIsFloatDragOverlay(false);
    setFloatOverlayOrigin({ x: 0, y: 0 });

    try {
      const pointerEvent = e as React.PointerEvent;
      const target = e.currentTarget as HTMLElement;
      if ('pointerId' in pointerEvent && target && 'setPointerCapture' in target) {
        target.setPointerCapture(pointerEvent.pointerId);
      }
    } catch (_) {}

    window.addEventListener('pointermove', handleMove, true);
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('pointercancel', handleCancel, true);
    window.addEventListener('mousemove', handleMove, true);
    window.addEventListener('mouseup', handleUp, true);
    document.addEventListener('pointermove', handleMove, true);
    document.addEventListener('pointerup', handleUp, true);
    document.addEventListener('pointercancel', handleCancel, true);
    document.addEventListener('mousemove', handleMove, true);
    document.addEventListener('mouseup', handleUp, true);
  };

  if (triggerMode === 'float') {
    return (
      <div
        className={`${isDark ? 'dark' : ''} w-screen h-screen bg-transparent relative overflow-hidden font-sans select-none pointer-events-auto ${isFloatDragOverlay ? '' : 'rounded-[22px]'}`}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onAuxClick={(e) => { if (e.button === 2) { e.preventDefault(); e.stopPropagation(); } }}
        onMouseEnter={handleFloatHoverEnter}
        onPointerEnter={handleFloatHoverEnter}
        onMouseLeave={handleFloatHoverLeave}
        onPointerLeave={handleFloatHoverLeave}
        onDragEnter={handleEdgeFileDrag}
        onDragOver={handleEdgeFileDrag}
        onDragLeave={handleFloatHoverLeave}
        onDrop={handleEdgeFileDrag}
      >
        <button
          className={`absolute rounded-[22px] overflow-hidden isolate bg-amber-100/95 dark:bg-amber-200/90 backdrop-blur-xl border border-amber-200/80 dark:border-amber-300/60 shadow-xl shadow-amber-200/30 dark:shadow-black/20 flex items-center justify-center cursor-pointer opacity-100 transition-transform ${isFloatDragOverlay ? 'shadow-2xl' : 'hover:scale-[1.03] active:scale-95'}`}
          style={isFloatDragOverlay ? { left: floatVisualPos.x - floatOverlayOrigin.x, top: floatVisualPos.y - floatOverlayOrigin.y, width: FLOAT_TRIGGER_SIZE, height: FLOAT_TRIGGER_SIZE } : { left: 0, top: 0, width: FLOAT_TRIGGER_SIZE, height: FLOAT_TRIGGER_SIZE }}
          title="左键单击打开抽屉，按住左键拖动悬浮方块，拖入文件也可打开"
          onClick={(e) => {
            // 左键单击打开已在 pointerup/mouseup 中处理，这里只阻止冒泡，避免重复打开。
            e.preventDefault();
            e.stopPropagation();
          }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onAuxClick={(e) => { if (e.button === 2) { e.preventDefault(); e.stopPropagation(); } }}
          onMouseEnter={handleFloatHoverEnter}
          onPointerEnter={handleFloatHoverEnter}
          onMouseLeave={handleFloatHoverLeave}
          onPointerLeave={handleFloatHoverLeave}
          onPointerDown={startFloatDrag}
          onMouseDown={startFloatDrag}
          onDragEnter={handleEdgeFileDrag}
          onDragOver={handleEdgeFileDrag}
          onDragLeave={handleFloatHoverLeave}
          onDrop={handleEdgeFileDrag}
        >
          <LayoutGrid className="w-5 h-5 text-amber-700 dark:text-amber-900 pointer-events-none" />
          <span className="absolute right-2 bottom-2 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.65)] pointer-events-none" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${isDark ? 'dark' : ''} w-screen h-screen bg-transparent relative overflow-hidden font-sans select-none pointer-events-none`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 侧边小条窗口本身只有可见高度；Ctrl + 左键按住可沿屏幕右侧上下移动。 */}
      <div
        className={`absolute left-0 top-1/2 -translate-y-1/2 w-full h-24 flex flex-col justify-center cursor-ns-resize ${isAntiTouchMode ? 'pointer-events-none' : 'pointer-events-auto'}`}
        title="悬停打开抽屉；Ctrl + 左键按住可上下移动小条"
        onMouseEnter={handleEdgeMouseTouch}
        onMouseOver={handleEdgeMouseTouch}
        onPointerEnter={handleEdgeMouseTouch}
        onPointerOver={handleEdgeMouseTouch}
        onMouseLeave={handleEdgeMouseLeave}
        onPointerLeave={handleEdgeMouseLeave}
        onPointerDown={startEdgeStripDrag}
        onMouseDown={startEdgeStripDrag}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onAuxClick={(e) => { if (e.button === 2) { e.preventDefault(); e.stopPropagation(); } }}
        onDragEnter={handleEdgeFileDrag}
        onDragOver={handleEdgeFileDrag}
        onDrop={handleEdgeFileDrag}
      >
        <div className="w-full h-24 bg-amber-100/95 dark:bg-amber-200/90 backdrop-blur-2xl rounded-l-[24px] shadow-sm shadow-amber-200/30 dark:shadow-black/20 border border-r-0 border-amber-200/80 dark:border-amber-300/60 flex items-center justify-center cursor-pointer transition-colors hover:bg-amber-100 dark:hover:bg-amber-200">
          <div className="w-1.5 h-10 bg-amber-500/85 dark:bg-amber-700/80 rounded-full shadow-inner shadow-amber-300/50" />
        </div>
      </div>
    </div>
  );
}


const makeFloatingNoteSnapshot = (item: BufferItem): FloatingNoteSnapshot => ({
  id: `note_${item.id}`,
  itemId: item.id,
  type: item.type,
  name: item.type === 'text' ? (item.remark || item.name || item.content) : item.name,
  content: item.content,
  path: item.path,
  url: item.url,
  thumbnail: item.thumbnail,
  ...readFloatingNoteViewState(item.id),
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as FloatingNoteSnapshot);

const readFloatingNoteSnapshot = (label = 'note_1'): FloatingNoteSnapshot | null => {
  try {
    const raw = localStorage.getItem(floatingNoteStorageKey(label));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.itemId || !parsed.type) return null;
    return parsed as FloatingNoteSnapshot;
  } catch (_) {
    return null;
  }
};

function FloatingNoteHost() {
  const noteLabel = ((appWindow as any).label || 'note_1') as string;
  const noteStorageKey = floatingNoteStorageKey(noteLabel);
  const initialNote = readFloatingNoteSnapshot(noteLabel);
  const [note, setNote] = useState<FloatingNoteSnapshot | null>(() => initialNote);
  const [text, setText] = useState(() => initialNote?.content || '');
  const [topmost, setTopmost] = useState(false);
  const [zoom, setZoom] = useState(() => {
    const view = readFloatingNoteViewState(initialNote?.itemId);
    return clamp(Number((initialNote as any)?.zoom ?? view.zoom ?? 1), 0.45, 3);
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showTextNoteColorPicker, setShowTextNoteColorPicker] = useState(false);
  const [isNoteHovered, setIsNoteHovered] = useState(false);
  const [isEditingNoteText, setIsEditingNoteText] = useState(false);
  const [isEditingNoteTitle, setIsEditingNoteTitle] = useState(false);
  const [noteTitleDraft, setNoteTitleDraft] = useState(() => initialNote?.name || '');
  const [scheduleDraft, setScheduleDraft] = useState('');
  const [textNoteSizeMode, setTextNoteSizeMode] = useState<TextFloatingNoteSizeMode>(() => {
    const view = readFloatingNoteViewState(initialNote?.itemId);
    return resolveTextFloatingNoteSizeMode((initialNote as any)?.width ?? view.width, (initialNote as any)?.height ?? view.height);
  });
  const noteTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const noteTitleInputRef = useRef<HTMLInputElement | null>(null);
  const noteRef = useRef<FloatingNoteSnapshot | null>(note);
  const noteTitleDraftRef = useRef(noteTitleDraft);
  const noteResizeAnimationRef = useRef<number | null>(null);
  const noteResizeAnimationTokenRef = useRef(0);
  const isDark = localStorage.getItem('theme') === 'dark';

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    noteTitleDraftRef.current = noteTitleDraft;
  }, [noteTitleDraft]);

  useEffect(() => () => {
    cancelNoteResizeAnimation();
  }, []);

  useEffect(() => {
    setText(note?.content || '');
    const view = readFloatingNoteViewState(note?.itemId);
    setZoom(clamp(Number((note as any)?.zoom ?? view.zoom ?? 1), 0.45, 3));
    setTextNoteSizeMode(resolveTextFloatingNoteSizeMode((note as any)?.width ?? view.width, (note as any)?.height ?? view.height));
    setIsEditingNoteText(false);
    setIsEditingNoteTitle(false);
    setShowTextNoteColorPicker(false);
    setNoteTitleDraft(note?.name || '');
    // 只在切换便签时退出编辑模式。
    // 之前依赖 note?.content，文字便签每输入一个字都会更新 note.content，
    // 触发这里 setIsEditingNoteText(false)，所以会自动失焦退出输入。
  }, [note?.id]);

  useEffect(() => {
    const syncFromStorage = () => {
      const next = readFloatingNoteSnapshot(noteLabel);
      setNote(next);
      setNoteTitleDraft(next?.name || '');
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === noteStorageKey) {
        syncFromStorage();
        return;
      }

      if (event.key === FLOATING_NOTE_SOURCE_BRIDGE_KEY && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue);
          const current = noteRef.current;
          if (!current || current.type !== 'text' || current.itemId !== payload.itemId) return;

          const hasContent = typeof payload.content === 'string';
          const nextContent = hasContent ? payload.content : current.content;
          const nextName = typeof payload.name === 'string' ? payload.name : current.name;
          const next = {
            ...current,
            content: nextContent,
            name: nextName,
            updatedAt: Date.now(),
          };

          noteRef.current = next;
          setNote(next);
          if (hasContent) setText(nextContent || '');
          setNoteTitleDraft(nextName || '');
          localStorage.setItem(noteStorageKey, JSON.stringify(next));
        } catch (_) {}
      }
    };

    let unlistenNote: (() => void) | undefined;
    let unlistenSourceText: (() => void) | undefined;

    listen('floating-note-updated', (event: any) => {
      const payload = event.payload as FloatingNoteSnapshot;
      if (payload && payload.itemId) {
        setNote(payload);
        setText(payload.content || '');
        setNoteTitleDraft(payload.name || '');
        setZoom(1);
        localStorage.setItem(noteStorageKey, JSON.stringify(payload));
        rememberOpenFloatingNoteLabel(noteLabel);
      } else {
        syncFromStorage();
      }
    }).then((fn) => { unlistenNote = fn; }).catch(() => {});

    listen('floating-note-source-updated', (event: any) => {
      const payload = event.payload || {};
      const current = noteRef.current;
      if (!current || current.type !== 'text' || current.itemId !== payload.itemId) return;

      const hasContent = typeof payload.content === 'string';
      const nextContent = hasContent ? payload.content : current.content;
      const nextName = typeof payload.name === 'string' ? payload.name : current.name;
      const next = {
        ...current,
        content: nextContent,
        name: nextName,
        updatedAt: Date.now(),
      };

      noteRef.current = next;
      setNote(next);
      if (hasContent) setText(nextContent || '');
      setNoteTitleDraft(nextName || '');
      localStorage.setItem(noteStorageKey, JSON.stringify(next));
    }).then((fn) => { unlistenSourceText = fn; }).catch(() => {});

    window.addEventListener('storage', onStorage);
    syncFromStorage();

    return () => {
      window.removeEventListener('storage', onStorage);
      if (unlistenNote) unlistenNote();
      if (unlistenSourceText) unlistenSourceText();
    };
  }, [noteLabel, noteStorageKey]);

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener('blur', closeContextMenu);
    return () => window.removeEventListener('blur', closeContextMenu);
  }, []);

  const hideNote = async () => {
    setContextMenu(null);
    // 这里只关闭/隐藏当前便签窗口，不删除便签记录。
    // 之后仍可在抽屉侧栏的“便签”列表里重新显示。
    try {
      await invoke('hide_note_window', { label: noteLabel });
    } catch (err) {
      console.warn('hide_note_window failed, fallback to frontend hide:', err);
      await appWindow.hide().catch(() => {});
    }
  };

  const toggleTopmost = async () => {
    const next = !topmost;
    setTopmost(next);
    await invoke('set_topmost', { topmost: next }).catch(() => {});
  };

  const openDrawerFromNote = async () => {
    setContextMenu(null);
    const { width, height } = getStoredDrawerSize();
    await invoke('open_drawer', { width, height, mode: getStoredTriggerMode() }).catch(() => {});
  };

  const openSource = async () => {
    const target = note?.path || note?.url || '';
    if (!target) return;
    await invoke('open_file', { path: target }).catch(() => {});
  };

  const persistFloatingNoteView = (patch: { zoom?: number; width?: number; height?: number }) => {
    const current = noteRef.current;
    if (!current) return;

    const nextView = writeFloatingNoteViewState(current.itemId, patch);
    const next = {
      ...current,
      ...nextView,
      updatedAt: Date.now(),
    } as FloatingNoteSnapshot;

    noteRef.current = next;
    setNote(next);
    localStorage.setItem(noteStorageKey, JSON.stringify(next));
  };

  const persistFloatingNotePatch = (patch: Partial<FloatingNoteSnapshot>) => {
    const current = noteRef.current;
    if (!current) return null;

    const next = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    } as FloatingNoteSnapshot;

    noteRef.current = next;
    setNote(next);
    localStorage.setItem(noteStorageKey, JSON.stringify(next));
    return next;
  };

  const cancelNoteResizeAnimation = () => {
    noteResizeAnimationTokenRef.current += 1;
    if (noteResizeAnimationRef.current !== null) {
      cancelAnimationFrame(noteResizeAnimationRef.current);
      noteResizeAnimationRef.current = null;
    }
    invoke('cancel_current_window_resize_animation').catch(() => {});
  };

  const animateTextNoteSize = (mode: TextFloatingNoteSizeMode) => {
    const current = noteRef.current;
    if (!current || current.type !== 'text') return;

    cancelNoteResizeAnimation();
    setContextMenu(null);
    setTextNoteSizeMode(mode);

    const target = TEXT_FLOATING_NOTE_SIZES[mode];
    persistFloatingNoteView({ width: target.width, height: target.height });
    invoke('animate_current_window_resize', {
      width: target.width,
      height: target.height,
      durationMs: 110,
    }).catch((err) => {
      console.warn('文字便签尺寸动画失败:', err);
      invoke('resize_current_window', { width: target.width, height: target.height }).catch(() => {});
    });
  };

  const cycleTextNoteSize = () => {
    const currentIndex = TEXT_FLOATING_NOTE_SIZE_ORDER.indexOf(textNoteSizeMode);
    const nextMode = TEXT_FLOATING_NOTE_SIZE_ORDER[(currentIndex + 1) % TEXT_FLOATING_NOTE_SIZE_ORDER.length];
    animateTextNoteSize(nextMode);
  };

  const changeTextNoteColor = (colorId: TextFloatingNoteColorId) => {
    const current = noteRef.current;
    if (!current || current.type !== 'text') return;
    persistFloatingNotePatch({ noteColor: colorId });
    setShowTextNoteColorPicker(false);
  };

  const syncTextToDrawer = (current: FloatingNoteSnapshot, nextContent: string) => {
    if (current.type !== 'text') return;
    const payload = {
      itemId: current.itemId,
      content: nextContent,
      noteMode: 'text',
      sourceLabel: noteLabel,
      updatedAt: Date.now(),
    };

    // 双通道同步：Tauri 事件 + localStorage storage 事件。
    // 有些隐藏/透明窗口下 emitTo 可能被时序影响，localStorage 兜底更稳。
    localStorage.setItem(FLOATING_NOTE_TEXT_BRIDGE_KEY, JSON.stringify(payload));
    emitTo('main', 'floating-note-text-updated', payload).catch(() => {});
  };

  const syncTitleToDrawer = (current: FloatingNoteSnapshot, nextTitle: string) => {
    if (current.type !== 'text') return;
    const payload = {
      itemId: current.itemId,
      name: nextTitle,
      sourceLabel: noteLabel,
      updatedAt: Date.now(),
    };

    localStorage.setItem(FLOATING_NOTE_TITLE_BRIDGE_KEY, JSON.stringify(payload));
    emitTo('main', 'floating-note-title-updated', payload).catch(() => {});
  };

  const updateTextLive = (nextContent: string) => {
    setText(nextContent);

    const current = noteRef.current;
    if (!current) return;

    const next = { ...current, noteMode: 'text' as const, content: nextContent, updatedAt: Date.now() };
    noteRef.current = next;
    setNote(next);
    localStorage.setItem(noteStorageKey, JSON.stringify(next));
    syncTextToDrawer(next, nextContent);
  };

  const saveText = () => {
    const current = noteRef.current;
    if (!current) return;
    updateTextLive(text);
  };

  const saveTitle = () => {
    const current = noteRef.current;
    if (!current) return;
    const fallback = current.name || current.content || '文字便签';
    const nextTitle = noteTitleDraftRef.current.trim() || fallback;
    const next = { ...current, name: nextTitle, updatedAt: Date.now() };
    noteRef.current = next;
    setNote(next);
    setNoteTitleDraft(nextTitle);
    localStorage.setItem(noteStorageKey, JSON.stringify(next));
    syncTitleToDrawer(next, nextTitle);
    setIsEditingNoteTitle(false);
  };

  const toggleScheduleMode = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const current = noteRef.current;
    if (!current || current.type !== 'text') return;

    const nextMode = current.noteMode === 'schedule' ? 'text' : 'schedule';
    const existingItems = Array.isArray(current.scheduleItems) ? current.scheduleItems : [];
    const itemsFromText = (current.content || '')
      .split(/\r?\n/)
      .map(line => line.replace(/^\s*(?:[-*+•]|(?:\d+[\).、]))\s*/, '').trim())
      .filter(Boolean)
      .map((line, idx) => ({
        id: `schedule_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        text: line,
        done: false,
        createdAt: Date.now() + idx,
      }));

    const next = persistFloatingNotePatch({
      noteMode: nextMode,
      scheduleItems: nextMode === 'schedule' && existingItems.length === 0 ? itemsFromText : existingItems,
    });
    if (nextMode === 'text') {
      const nextContent = next?.content || current.content || '';
      setText(nextContent);
      syncTextToDrawer(next || { ...current, noteMode: 'text' }, nextContent);
    }
    setIsEditingNoteText(false);
    setIsEditingNoteTitle(false);
  };

  const addScheduleItem = () => {
    const current = noteRef.current;
    const text = scheduleDraft.trim();
    if (!current || current.type !== 'text' || !text) return;

    const nextItem: FloatingNoteScheduleItem = {
      id: `schedule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      done: false,
      createdAt: Date.now(),
    };
    persistFloatingNotePatch({
      noteMode: 'schedule',
      scheduleItems: [...(current.scheduleItems || []), nextItem],
    });
    setScheduleDraft('');
  };

  const toggleScheduleItem = (id: string) => {
    const current = noteRef.current;
    if (!current || current.type !== 'text') return;

    persistFloatingNotePatch({
      scheduleItems: (current.scheduleItems || []).map(item => (
        item.id === id ? { ...item, done: !item.done, updatedAt: Date.now() } : item
      )),
    });
  };

  const removeScheduleItem = (id: string) => {
    const current = noteRef.current;
    if (!current || current.type !== 'text') return;

    persistFloatingNotePatch({
      scheduleItems: (current.scheduleItems || []).filter(item => item.id !== id),
    });
  };

  const startTitleEdit = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const current = noteRef.current;
    setContextMenu(null);
    setIsEditingNoteText(false);
    setNoteTitleDraft(current?.name || current?.content || '');
    if (textNoteSizeMode === 'small') {
      animateTextNoteSize('medium');
    }
    setIsEditingNoteTitle(true);
  };

  useEffect(() => {
    if (!isEditingNoteText) return;
    window.setTimeout(() => {
      noteTextAreaRef.current?.focus();
      noteTextAreaRef.current?.setSelectionRange(text.length, text.length);
    }, 0);
  }, [isEditingNoteText, text.length]);

  useEffect(() => {
    if (!isEditingNoteTitle) return;
    window.setTimeout(() => {
      noteTitleInputRef.current?.focus();
      noteTitleInputRef.current?.select();
    }, 0);
  }, [isEditingNoteTitle]);

  useEffect(() => {
    if (!isEditingNoteTitle) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && noteTitleInputRef.current?.contains(target)) return;
      saveTitle();
    };

    window.addEventListener('pointerdown', handlePointerDownOutside, true);
    document.addEventListener('pointerdown', handlePointerDownOutside, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside, true);
      document.removeEventListener('pointerdown', handlePointerDownOutside, true);
    };
  }, [isEditingNoteTitle]);

  const startTextEdit = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setContextMenu(null);
    setIsEditingNoteText(true);
  };

  const handleTextDisplayMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // 第二下点击时立即进入编辑，避免父级拖动逻辑吞掉 dblclick。
    if (e.detail >= 2) {
      startTextEdit(e);
      return;
    }

    startManualMove(e);
  };

  const handleTextNoteTitleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.detail >= 2) return;
    startManualMove(e);
  };

  const handleTextNoteTitleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cycleTextNoteSize();
  };

  const finishTextEdit = () => {
    saveText();
    setIsEditingNoteText(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 148;
    const menuHeight = 92;
    setContextMenu({
      x: Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth - 8)),
      y: Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight - 8)),
    });
  };

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (!note) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;

    setZoom(prev => {
      const nextZoom = clamp(Number((prev + delta).toFixed(2)), 0.45, 3);
      persistFloatingNoteView({ zoom: nextZoom });
      return nextZoom;
    });
  };

  const startManualMove = (e: React.PointerEvent | React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);

    let disposed = false;
    let lastX = e.screenX;
    let lastY = e.screenY;
    let pendingDx = 0;
    let pendingDy = 0;
    let raf: number | null = null;

    try {
      const target = e.currentTarget as HTMLElement | null;
      const pointerId = (e as any).pointerId;
      if (target && pointerId !== undefined && 'setPointerCapture' in target) {
        target.setPointerCapture(pointerId);
      }
    } catch (_) {}

    const applyMove = () => {
      raf = null;
      if (disposed) return;

      const dx = pendingDx;
      const dy = pendingDy;
      pendingDx = 0;
      pendingDy = 0;

      if (dx || dy) {
        invoke('move_current_window_by', { dx, dy }).catch((err) => {
          console.warn('移动便签失败:', err);
        });
      }
    };

    const requestMove = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(applyMove);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
      window.removeEventListener('pointercancel', handleUp, true);
      window.removeEventListener('mousemove', handleMove, true);
      window.removeEventListener('mouseup', handleUp, true);
      document.removeEventListener('pointermove', handleMove, true);
      document.removeEventListener('pointerup', handleUp, true);
      document.removeEventListener('pointercancel', handleUp, true);
      document.removeEventListener('mousemove', handleMove, true);
      document.removeEventListener('mouseup', handleUp, true);
    };

    const finish = () => {
      if (disposed) return;
      disposed = true;
      cleanup();
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      if (pendingDx || pendingDy) applyMove();
    };

    const handleMove: EventListener = (event) => {
      if (disposed) return;
      const me = event as PointerEvent | MouseEvent;
      if ('buttons' in me && (me.buttons & 1) !== 1) {
        finish();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const dx = me.screenX - lastX;
      const dy = me.screenY - lastY;
      lastX = me.screenX;
      lastY = me.screenY;

      if (dx || dy) {
        pendingDx += dx;
        pendingDy += dy;
        requestMove();
      }
    };

    const handleUp: EventListener = (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish();
    };

    window.addEventListener('pointermove', handleMove, true);
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('pointercancel', handleUp, true);
    window.addEventListener('mousemove', handleMove, true);
    window.addEventListener('mouseup', handleUp, true);
    document.addEventListener('pointermove', handleMove, true);
    document.addEventListener('pointerup', handleUp, true);
    document.addEventListener('pointercancel', handleUp, true);
    document.addEventListener('mousemove', handleMove, true);
    document.addEventListener('mouseup', handleUp, true);
  };

  const startNoteDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-no-drag="true"], textarea, button, input, select, [data-text-note-display="true"]')) return;
    startManualMove(e);
  };

  const startNoteResize = (e: React.PointerEvent | React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    cancelNoteResizeAnimation();

    const startX = e.screenX;
    const startY = e.screenY;
    const startW = Math.max(220, window.innerWidth);
    const startH = Math.max(160, window.innerHeight);

    let disposed = false;
    let latestW = startW;
    let latestH = startH;
    let raf: number | null = null;

    try {
      const target = e.currentTarget as HTMLElement | null;
      const pointerId = (e as any).pointerId;
      if (target && pointerId !== undefined && 'setPointerCapture' in target) {
        target.setPointerCapture(pointerId);
      }
    } catch (_) {}

    const applySize = () => {
      raf = null;
      if (disposed) return;
      void invoke('resize_current_window', { width: latestW, height: latestH }).catch((err) => {
        console.warn('缩放便签失败:', err);
      });
    };

    const requestSize = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(applySize);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
      window.removeEventListener('pointercancel', handleUp, true);
      window.removeEventListener('mousemove', handleMove, true);
      window.removeEventListener('mouseup', handleUp, true);
      document.removeEventListener('pointermove', handleMove, true);
      document.removeEventListener('pointerup', handleUp, true);
      document.removeEventListener('pointercancel', handleUp, true);
      document.removeEventListener('mousemove', handleMove, true);
      document.removeEventListener('mouseup', handleUp, true);
    };

    const finish = () => {
      if (disposed) return;
      disposed = true;
      cleanup();
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      persistFloatingNoteView({ width: latestW, height: latestH });
      if (noteRef.current?.type === 'text') {
        setTextNoteSizeMode(resolveTextFloatingNoteSizeMode(latestW, latestH));
      }
      void invoke('resize_current_window', { width: latestW, height: latestH }).catch(() => {});
    };

    const handleMove: EventListener = (event) => {
      if (disposed) return;
      const me = event as PointerEvent | MouseEvent;
      if ('buttons' in me && (me.buttons & 1) !== 1) {
        finish();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      latestW = clamp(startW + me.screenX - startX, 220, 920);
      latestH = clamp(startH + me.screenY - startY, 160, 820);
      requestSize();
    };

    const handleUp: EventListener = (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish();
    };

    window.addEventListener('pointermove', handleMove, true);
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('pointercancel', handleUp, true);
    window.addEventListener('mousemove', handleMove, true);
    window.addEventListener('mouseup', handleUp, true);
    document.addEventListener('pointermove', handleMove, true);
    document.addEventListener('pointerup', handleUp, true);
    document.addEventListener('pointercancel', handleUp, true);
    document.addEventListener('mousemove', handleMove, true);
    document.addEventListener('mouseup', handleUp, true);
  };

  const imageSrc = note?.url || (note?.path ? convertFileSrc(note.path) : '');
  const displayName = note?.name || note?.content || '桌面便签';
  const zoomTitle = `滚轮缩放：${Math.round(zoom * 100)}%`;
  const isTextNoteMedium = note?.type === 'text' && textNoteSizeMode === 'medium';
  const isTextNoteSmall = note?.type === 'text' && textNoteSizeMode === 'small';
  const textNoteTitle = note?.name || text || '文字便签';
  const textNoteInitial = Array.from((textNoteTitle || '便').trim())[0] || '便';
  const isScheduleMode = note?.type === 'text' && note.noteMode === 'schedule';
  const scheduleItems = Array.isArray(note?.scheduleItems) ? note.scheduleItems : [];
  const textNoteColor = getTextFloatingNoteColor(note?.noteColor);
  const textNoteBodyStyle = note?.type === 'text'
    ? { backgroundColor: isDark ? textNoteColor.darkBody : textNoteColor.body }
    : undefined;
  const textNoteHeaderStyle = note?.type === 'text'
    ? {
      backgroundColor: isDark ? textNoteColor.darkHeader : textNoteColor.header,
      borderColor: isDark ? textNoteColor.darkBorder : textNoteColor.border,
      color: isDark ? textNoteColor.darkText : textNoteColor.text,
    }
    : undefined;
  const textNoteAccentColor = isDark ? textNoteColor.darkIcon : textNoteColor.icon;
  const textNoteTextColor = isDark ? textNoteColor.darkText : textNoteColor.text;

  return (
    <div
      className={`${isDark ? 'dark ' : ''}w-screen h-screen overflow-hidden rounded-[24px] border border-black/10 dark:border-white/10 bg-white/96 text-stone-800 dark:bg-stone-950/96 dark:text-stone-100 font-sans select-none`}
      onContextMenu={handleContextMenu}
      onWheel={handleWheelZoom}
      onMouseDown={startNoteDrag}
      onMouseEnter={() => setIsNoteHovered(true)}
      onMouseLeave={() => setIsNoteHovered(false)}
      title={zoomTitle}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[24px]">
        {!isTextNoteMedium && !isTextNoteSmall && (
          <div className="absolute right-3 top-3 z-40 flex gap-1.5">
            {note?.type === 'text' && (
              <div data-no-drag="true" className="relative">
                <button
                  data-no-drag="true"
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={() => {
                    setContextMenu(null);
                    setShowTextNoteColorPicker(prev => !prev);
                  }}
                  title="更换便签颜色"
                  className={`rounded-full border border-white/80 bg-white/78 p-1.5 shadow-lg backdrop-blur-xl transition-all duration-150 hover:bg-white dark:border-stone-700/70 dark:bg-stone-900/62 dark:hover:bg-stone-800 ${
                    isNoteHovered || showTextNoteColorPicker ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'
                  }`}
                  style={{ color: textNoteAccentColor }}
                >
                  <Palette className="h-3.5 w-3.5" />
                </button>
                <AnimatePresence>
                  {showTextNoteColorPicker && (
                    <motion.div
                      data-no-drag="true"
                      initial={{ opacity: 0, scale: 0.96, y: -2 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -2 }}
                      transition={{ type: 'tween', duration: 0.12 }}
                      className="absolute right-0 top-8 z-50 grid w-[142px] grid-cols-4 gap-1.5 rounded-[16px] border border-white/80 bg-white/92 p-2 shadow-2xl backdrop-blur-xl dark:border-stone-700/70 dark:bg-stone-900/92"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {TEXT_FLOATING_NOTE_COLORS.map(color => (
                        <button
                          key={color.id}
                          data-no-drag="true"
                          type="button"
                          onClick={() => changeTextNoteColor(color.id)}
                          title={color.label}
                          className={`h-7 w-7 rounded-full border transition-transform hover:scale-105 ${
                            textNoteColor.id === color.id ? 'border-stone-700 ring-2 ring-stone-900/10 dark:border-stone-100 dark:ring-white/15' : 'border-white/90 dark:border-stone-700/80'
                          }`}
                          style={{ backgroundColor: color.swatch }}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            {note?.type === 'text' && (
              <button
                data-no-drag="true"
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={toggleScheduleMode}
                title={isScheduleMode ? '切回文字便签' : '转为日程便签'}
                className={`rounded-full p-1.5 backdrop-blur-xl border shadow-lg transition-all duration-150 ${
                  isNoteHovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'
                } ${
                  isScheduleMode
                    ? 'bg-amber-100/95 text-amber-700 border-amber-200 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700/60'
                    : 'bg-white/75 text-stone-500 border-white/80 hover:bg-white hover:text-amber-700 dark:bg-stone-900/60 dark:text-stone-300 dark:border-stone-700/70 dark:hover:bg-stone-800'
                }`}
              >
                <CheckSquare className="h-3.5 w-3.5" />
              </button>
            )}
        <button
          data-no-drag="true"
          onClick={toggleTopmost}
          title={topmost ? '取消置顶' : '置顶'}
          className={`rounded-full p-1.5 backdrop-blur-xl border shadow-lg transition-all duration-150 ${
            isNoteHovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'
          } ${
            topmost
              ? 'bg-amber-100/95 text-amber-700 border-amber-200 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700/60'
              : 'bg-white/75 text-stone-500 border-white/80 hover:bg-white hover:text-stone-900 dark:bg-stone-900/60 dark:text-stone-300 dark:border-stone-700/70 dark:hover:bg-stone-800'
          }`}
        >
          <Pin className={`h-3.5 w-3.5 ${topmost ? 'fill-amber-300/70' : ''}`} />
        </button>
          </div>
        )}

        {!note ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-xs leading-5 text-stone-500 dark:text-stone-400">
            还没有便签内容。回到抽屉，在卡片右上角点击“便签”按钮。
          </div>
        ) : note.type === 'image' ? (
          <div className="flex h-full w-full items-center justify-center overflow-hidden bg-stone-950">
            {imageSrc ? (
              <img
                src={imageSrc}
                className="max-h-full max-w-full object-contain pointer-events-none select-none transition-transform duration-100"
                style={{ transform: `scale(${zoom})` }}
                draggable={false}
                alt={displayName}
              />
            ) : (
              <ImageIcon className="h-10 w-10 text-stone-600" />
            )}
          </div>
        ) : note.type === 'text' ? (
          <div
            className="flex h-full w-full flex-col overflow-hidden bg-amber-50/92 transition-colors duration-200 ease-linear dark:bg-stone-900/96"
            style={textNoteBodyStyle}
          >
            <div
              onMouseDown={handleTextNoteTitleMouseDown}
              onDoubleClick={handleTextNoteTitleDoubleClick}
              title="拖动移动便签，双击切换尺寸"
              className={`flex shrink-0 items-center border-amber-200/70 bg-amber-100/82 text-amber-950/85 shadow-sm backdrop-blur-xl transition-[height,width,padding,background-color,border-color,border-radius] duration-200 ease-linear dark:border-stone-700/70 dark:bg-stone-800/86 dark:text-stone-100 ${
                isTextNoteSmall
                  ? 'h-full w-full justify-center rounded-[18px] border-0 p-0 text-center'
                  : isTextNoteMedium
                    ? 'h-full w-full gap-2 border-0 px-4'
                    : 'h-12 w-full gap-2 border-b px-4 pr-14'
              }`}
              style={textNoteHeaderStyle}
            >
              {isTextNoteSmall ? (
                <div
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5"
                  title="双击切换尺寸"
                >
                  <StickyNote className="h-3.5 w-3.5 shrink-0 text-amber-600/85 dark:text-amber-300/85" strokeWidth={2.4} style={{ color: textNoteAccentColor }} />
                  <span className="max-w-[32px] truncate text-[13px] font-black leading-none text-amber-900/90 dark:text-amber-100" style={{ color: textNoteTextColor }}>
                    {textNoteInitial}
                  </span>
                </div>
              ) : (
                <>
                  <StickyNote className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" style={{ color: textNoteAccentColor }} />
                  <div className="min-w-0 w-1/2 max-w-[50%] shrink-0">
                    {isEditingNoteTitle ? (
                      <input
                        ref={noteTitleInputRef}
                        data-no-drag="true"
                        value={noteTitleDraft}
                        onChange={(e) => setNoteTitleDraft(e.target.value)}
                        onBlur={saveTitle}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            saveTitle();
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            setNoteTitleDraft(noteRef.current?.name || '');
                            setIsEditingNoteTitle(false);
                          }
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className="h-7 w-full rounded-[10px] border border-amber-300/70 bg-white/80 px-2 text-xs font-black text-amber-950 outline-none ring-2 ring-amber-300/20 dark:border-stone-600 dark:bg-stone-900/80 dark:text-stone-100 dark:ring-stone-500/20"
                      />
                    ) : (
                      <div
                        data-no-drag="true"
                        onMouseDown={(e) => {
                          if (e.detail >= 2) e.stopPropagation();
                        }}
                        onDoubleClick={startTitleEdit}
                        className="truncate text-xs font-black leading-4"
                        title="双击修改标题"
                      >
                        {textNoteTitle}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 self-stretch" />
                </>
              )}
            </div>

            {!isTextNoteMedium && !isTextNoteSmall && (
            <div className="min-h-0 flex-1 p-5 pt-4 transition-[padding] duration-200 ease-linear">
              {isScheduleMode ? (
                <div data-no-drag="true" className="flex h-full min-h-0 flex-col gap-3">
                  <div className="flex shrink-0 gap-2">
                    <input
                      value={scheduleDraft}
                      onChange={(e) => setScheduleDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addScheduleItem();
                        }
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      placeholder="添加日程..."
                      className="min-w-0 flex-1 rounded-[14px] border border-amber-200/70 bg-white/70 px-3 py-2 text-xs font-medium text-stone-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-300/20 dark:border-stone-700 dark:bg-stone-950/45 dark:text-stone-100 dark:focus:border-amber-500/60"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={addScheduleItem}
                      className="rounded-[14px] bg-amber-500 px-2.5 text-white shadow-sm transition-colors hover:bg-amber-600 dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300"
                      title="添加日程"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-amber-300/70 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {scheduleItems.length === 0 ? (
                      <div className="flex h-full items-center justify-center rounded-[18px] border border-dashed border-amber-200/80 bg-amber-100/35 px-4 text-center text-xs font-medium text-amber-700/65 dark:border-stone-700 dark:bg-stone-800/30 dark:text-stone-400">
                        今天还没有安排
                      </div>
                    ) : (
                      scheduleItems.map(item => (
                        <div key={item.id} className="group/schedule flex items-start gap-2 rounded-[16px] border border-amber-100/75 bg-white/55 px-2.5 py-2 shadow-sm transition-colors dark:border-stone-700/70 dark:bg-stone-950/28">
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={() => toggleScheduleItem(item.id)}
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
                              item.done
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-amber-300 bg-white/70 text-transparent dark:border-stone-600 dark:bg-stone-900/70'
                            }`}
                            title={item.done ? '标记为未完成' : '标记为完成'}
                          >
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </button>
                          <div className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-xs leading-5 ${item.done ? 'text-stone-400 line-through dark:text-stone-500' : 'text-stone-700 dark:text-stone-100'}`}>
                            {item.text}
                          </div>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={() => removeScheduleItem(item.id)}
                            className="shrink-0 rounded-[10px] p-1 text-stone-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover/schedule:opacity-100 dark:text-stone-600 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                            title="删除日程"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : isEditingNoteText ? (
                <textarea
                  ref={noteTextAreaRef}
                  data-no-drag="true"
                  value={text}
                  onChange={(e) => updateTextLive(e.target.value)}
                  onBlur={finishTextEdit}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') finishTextEdit();
                    if (e.key === 'Escape') finishTextEdit();
                  }}
                  onContextMenu={handleContextMenu}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-full w-full resize-none bg-transparent outline-none text-stone-700 transition-[font-size,line-height] duration-200 ease-linear dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500"
                  style={{ fontSize: `${14 * zoom}px`, lineHeight: 1.65, color: textNoteTextColor }}
                  placeholder="写点灵感..."
                />
              ) : (
                <div
                  data-text-note-display="true"
                  onMouseDown={handleTextDisplayMouseDown}
                  onDoubleClick={startTextEdit}
                  className="h-full w-full overflow-y-auto whitespace-pre-wrap break-words text-stone-700 transition-[font-size,line-height] duration-200 ease-linear dark:text-stone-100"
                  style={{ fontSize: `${14 * zoom}px`, lineHeight: 1.65, color: textNoteTextColor }}
                  title="单击拖动便签，双击编辑文字"
                >
                  {text.trim() ? text : <span style={{ color: textNoteAccentColor }}>双击写点灵感...</span>}
                </div>
              )}
            </div>
            )}
          </div>
        ) : (
          <button
            data-no-drag="true"
            onDoubleClick={openSource}
            className="flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden p-6 text-center transition-colors hover:bg-stone-50 dark:hover:bg-stone-900"
          >
            <div className="transition-transform duration-100" style={{ transform: `scale(${zoom})` }}>
              {note.type === 'video' ? <Film className="h-12 w-12 text-emerald-500" /> : <FileIcon className="h-12 w-12 text-amber-500" />}
            </div>
            <span className="max-w-full truncate text-sm font-bold">{note.name || '文件便签'}</span>
            <span className="max-w-full truncate text-[11px] text-stone-500 dark:text-stone-400">双击打开源文件</span>
          </button>
        )}

        {!isTextNoteMedium && !isTextNoteSmall && (
        <div
          data-no-drag="true"
          onPointerDown={startNoteResize}
          onMouseDown={startNoteResize}
          title="拖动缩放便签"
          className={`absolute bottom-1 right-1 z-40 h-11 w-11 cursor-nwse-resize rounded-br-[24px] transition-opacity duration-150 ${
            isNoteHovered ? 'opacity-100' : 'opacity-25'
          }`}
        >
          <div className="absolute bottom-2 right-2 h-5 w-5 rounded-br-[16px] border-b-2 border-r-2 border-stone-500/45 dark:border-stone-200/45" />
          <div className="absolute bottom-2 right-2 h-3 w-3 rounded-br-[12px] border-b-2 border-r-2 border-stone-500/30 dark:border-stone-200/30" />
        </div>
        )}

        <AnimatePresence>
          {contextMenu && (
            <motion.div
              data-no-drag="true"
              initial={{ opacity: 0, scale: 0.96, y: -2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -2 }}
              transition={{ type: 'tween', duration: 0.12 }}
              className="fixed z-50 w-[148px] overflow-hidden rounded-[16px] border border-stone-200/80 bg-white/95 p-1.5 text-xs font-bold text-stone-700 shadow-2xl backdrop-blur-xl dark:border-stone-700/70 dark:bg-stone-900/95 dark:text-stone-200"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void openDrawerFromNote();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <LayoutGrid className="h-3.5 w-3.5 text-amber-500" />
                打开抽屉
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void hideNote();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300"
              >
                <X className="h-3.5 w-3.5" />
                关闭窗口
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
  const [selectedAlchemyItemId, setSelectedAlchemyItemId] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(shouldShowInitialLaunchIntro);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [triggerMode, setTriggerMode] = useState<TriggerMode>(() => getStoredTriggerMode());
  const triggerModeRef = useRef<TriggerMode>(triggerMode);
  useEffect(() => { triggerModeRef.current = triggerMode; }, [triggerMode]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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
  const startupAutoCloseTimerRef = useRef<any | null>(null);
  const startupAutoCloseSuppressedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
  const [isAntiTouchMode, setIsAntiTouchMode] = useState(() => localStorage.getItem('drawer_anti_touch_mode') === 'true');
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [showLaunchIntro, setShowLaunchIntro] = useState(shouldShowInitialLaunchIntro);
  const showLaunchIntroRef = useRef(showLaunchIntro);
  useEffect(() => { showLaunchIntroRef.current = showLaunchIntro; }, [showLaunchIntro]);
  const [showUpdateLog, setShowUpdateLog] = useState(false);
  const showUpdateLogRef = useRef(showUpdateLog);
  useEffect(() => { showUpdateLogRef.current = showUpdateLog; }, [showUpdateLog]);
  const [isSplashVisible, setIsSplashVisible] = useState(showLaunchIntro);
  const isSplashVisibleRef = useRef(isSplashVisible);
  useEffect(() => { isSplashVisibleRef.current = isSplashVisible; }, [isSplashVisible]);

  const closeUpdateLog = () => {
    setShowUpdateLog(false);
    showUpdateLogRef.current = false;
    localStorage.setItem('drawer_v3_update_shown', 'true');
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

  const [noteManagerVersion, setNoteManagerVersion] = useState(0);
  const [quickRailMode, setQuickRailMode] = useState<'quick' | 'notes'>('quick');
  const refreshNoteManager = () => setNoteManagerVersion(version => version + 1);

  const openFloatingNoteEntries = useMemo(() => (
    readOpenFloatingNoteLabels()
      .map(label => ({ label, snapshot: readFloatingNoteSnapshot(label) }))
      .filter(entry => !!entry.snapshot)
  ), [noteManagerVersion, items]);

  const openFloatingNoteCount = openFloatingNoteEntries.length;

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === OPEN_FLOATING_NOTES_STORAGE_KEY ||
        event.key === FLOATING_NOTE_TEXT_BRIDGE_KEY ||
        event.key === FLOATING_NOTE_TITLE_BRIDGE_KEY ||
        event.key === FLOATING_NOTE_SOURCE_BRIDGE_KEY ||
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
      });
      await emitTo(label, 'floating-note-updated', note).catch(() => {});
      refreshNoteManager();
    } catch (err) {
      console.error('显示便签失败:', err);
      showToast('显示便签失败');
    }
  };

  const closeFloatingNoteByLabel = async (label: string) => {
    try {
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
    labels.forEach(label => deleteFloatingNoteSnapshot(label));
    await Promise.all(labels.map(label => invoke('hide_note_window', { label }).catch(() => {})));
    refreshNoteManager();
    showToast(labels.length > 0 ? '已删除全部便签' : '当前没有保存的便签');
  };

  const createFloatingNote = async (item: BufferItem) => {
    try {
      const openLabels = readOpenFloatingNoteLabels();
      const noteLabel = FLOATING_NOTE_LABELS.find(label => !openLabels.includes(label));
      if (!noteLabel) {
        showToast('便签已达上限，请先在抽屉侧栏删除一个便签');
        return;
      }
      const view = readFloatingNoteViewState(item.id);
      const defaultWidth = item.type === 'text' ? TEXT_FLOATING_NOTE_SIZES.large.width : 360;
      const defaultHeight = item.type === 'text' ? TEXT_FLOATING_NOTE_SIZES.large.height : 340;
      const snapshot = {
        ...makeFloatingNoteSnapshot(item),
        id: `${noteLabel}_${item.id}_${Date.now()}`,
        zoom: Number(view.zoom ?? 1),
        width: Number(view.width ?? defaultWidth),
        height: Number(view.height ?? defaultHeight),
      };

      localStorage.setItem(floatingNoteStorageKey(noteLabel), JSON.stringify(snapshot));
      rememberOpenFloatingNoteLabel(noteLabel);

      await invoke('show_note_window', {
        label: noteLabel,
        width: snapshot.width,
        height: snapshot.height,
      });
      await emitTo(noteLabel, 'floating-note-updated', snapshot).catch(() => {});
      refreshNoteManager();
      showToast('已打开桌面便签');
    } catch (err) {
      console.error('打开桌面便签失败:', err);
      showToast('打开桌面便签失败');
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
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const draggingItemIdRef = useRef<string | null>(null);
  useEffect(() => { draggingItemIdRef.current = draggingItemId; }, [draggingItemId]);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showMoveFolderModal, setShowMoveFolderModal] = useState(false);
  const [moveFolderName, setMoveFolderName] = useState('');

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [snipMode, setSnipMode] = useState<{ active: boolean; bg: string }>({ active: false, bg: '' });
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
    };
  }, []);

  useEffect(() => {
    invoke('get_shortcut', { name: 'update_shortcut' }).then((res: any) => { if (res) setShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_snip_shortcut' }).then((res: any) => { if (res) setSnipShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_text_shortcut' }).then((res: any) => { if (res) setTextShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_search_shortcut' }).then((res: any) => { if (res) setSearchShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_trigger_shortcut' }).then((res: any) => { if (res) { setTriggerShortcut(res); localStorage.setItem('drawer_trigger_shortcut', res); } }).catch(()=>{});
    invoke('get_auto_start').then((res: any) => setIsAutoStart(!!res)).catch(()=>{});
    invoke('get_local_ip').then((res: any) => setLocalIP(String(res || ''))).catch(()=>{});
    invoke('get_mobile_pair_url').then((res: any) => setMobilePairUrl(String(res || ''))).catch(()=>{});
    invoke('set_topmost', { topmost: true }).catch(()=>{});
  }, []);

  const handleOpenTextInput = () => { setShowTextInput(true); setIsSearchActive(false); setShowSettings(false); setShowFolderModal(false); };
  const handleOpenFolderModal = () => { setShowFolderModal(true); setIsSearchActive(false); setShowSettings(false); setShowTextInput(false); };
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
    if (activeTab === 'notes') {
      return [];
    }
    if (activeTab === 'alchemy') {
      return result.filter(item => isAlchemyCandidate(item));
    }
    return result.filter(item => activeTab === 'all' || item.type === activeTab);
  }, [items, activeTab, searchQuery, activeFolderId]);

  const alchemyCount = useMemo(() => (items as AlchemyBufferItem[]).filter(item => isAlchemyCandidate(item)).length, [items]);
  const finishedAlchemyCount = useMemo(() => (items as AlchemyBufferItem[]).filter(item => getAlchemyState(item) === 'alchemy').length, [items]);

  const quickAccessItems = items.filter(item => item.isQuickAccess);

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

  const focusAlchemyCard = (itemId: string, options?: { toast?: boolean }) => {
    setActiveTab('alchemy');
    setSelectedAlchemyItemId(itemId);
    setIsOpen(true);
    window.setTimeout(() => {
      const target = document.querySelector(`[data-alchemy-card-id="${itemId}"]`);
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
          const thumbB64 = await invoke('get_video_thumb', { path: newItem.path });
          if (thumbB64) newItem.thumbnail = thumbB64 as string;
          if (!newItem.url) newItem.url = convertFileSrc(newItem.path);
        } catch (e) {
          if (!newItem.url) newItem.url = convertFileSrc(newItem.path);
        }
      }
      setItems(prev => [newItem, ...prev]);
      setActiveTab('all'); setActiveFolderId('all'); setIsOpen(true);
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
    const setupShortcuts = async () => {
      // 封装一个极其安全的注册器
      // 🌟 带有屏幕报错反馈的注册器
      const safeRegister = async (key: string, handler: (e: any) => void) => {
        if (!key) return;
        try {
          const isReg = await isRegistered(key);
          if (isReg) await unregister(key);
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
          emitTo('edge', 'anti-touch-changed', next).catch(() => {});
          setIsAntiTouchMode(next);
          if (next) {
              setIsOpen(false); setIsPinned(false);
              isPointerInsideDrawerRef.current = false;
              invoke('toggle_pin', { pinned: false }).catch(()=>{});
              invoke('close_drawer', { mode: triggerModeRef.current }).catch(()=>{});
          }
          showToast(next ? '🔒 防误触已开启，抽屉已锁定' : '🔓 防误触已解除');
        }
      });

      await safeRegister(snipShortcut, (e) => {
  if (e.state === 'Pressed') {
    startSnip();
  }
});
      await safeRegister(textShortcut, (e) => {
        if (e.state === 'Pressed') {
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
          toggleTriggerMode();
        }
      });
    };

    setupShortcuts();

    // 🌟 核心修复：React 严格模式的清场钩子
    return () => {
      const cleanup = async () => {
        try {
          await unregister(shortcut).catch(()=>{});
          await unregister(snipShortcut).catch(()=>{});
          await unregister(textShortcut).catch(()=>{});
          await unregister(searchShortcut).catch(()=>{});
          await unregister(triggerShortcut).catch(()=>{});
        } catch (err) {}
      };
      cleanup();
    };
  }, [snipShortcut, shortcut, textShortcut, searchShortcut, triggerShortcut]);

  useEffect(() => {
    let unlisten: () => void;
    listen('force-rescue', () => {
      setIsPinned(false); setIsOpen(true); setShowSettings(false);
      setShowHelp(false); setShowQR(false); setConfirmDialog(prev => ({...prev, isOpen: false}));
      setShowTextInput(false); setShowFolderModal(false); setShowUpdateLog(false);
    }).then(f => unlisten = f);
    return () => { if (unlisten) unlisten(); };
  }, []);


  useEffect(() => {
    let unlistenOpen: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    let unlistenStartup: (() => void) | undefined;

    const handleOpened = (fromStartup = false) => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      // 普通展开来自鼠标悬停/点击，默认认为鼠标在抽屉内；
      // 启动欢迎页期间的打开不改变鼠标状态，避免动画期间误触发自动缩回。
      const isStartupPreview = fromStartup || showLaunchIntroRef.current || isSplashVisibleRef.current || showUpdateLogRef.current;
      if (!isStartupPreview) {
        startupAutoCloseSuppressedRef.current = false;
        isPointerInsideDrawerRef.current = true;
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
      if (showTextInput) { setShowTextInput(false); setIsOpen(false); }
      else { handleOpenTextInput(); setIsOpen(true); }
    }).then(f => unlisten1 = f);

    listen('open-search-bar', () => {
      if (isSearchActive) { setIsSearchActive(false); setIsOpen(false); }
      else { toggleSearch(); setIsOpen(true); }
    }).then(f => unlisten2 = f);
    return () => { if (unlisten1) unlisten1(); if (unlisten2) unlisten2(); };
  }, [showTextInput, isSearchActive]);

  useEffect(() => {
    if (!isOpen && !isPinned) {
      setShowSettings(false); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingText(false); setIsRecordingSearch(false); setIsRecordingTrigger(false);
      setShowHelp(false); setShowQR(false); setIsSelectMode(false); setSelectedIds([]);
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
    invoke('load_items').then((savedItems: any) => { if (savedItems && savedItems.length > 0) setItems(savedItems); setIsDataLoaded(true); }).catch(() => setIsDataLoaded(true));
    invoke('load_folders').then((savedFolders: any) => { if (savedFolders && savedFolders.length > 0) setFolders(savedFolders); }).catch(()=>{});
  }, []);

  useEffect(() => { if (isDataLoaded) invoke('save_items', { items }).catch(()=>{}); }, [items, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) invoke('save_folders', { folders }).catch(()=>{}); }, [folders, isDataLoaded]);
  const broadcastFloatingNoteTextUpdate = (itemId: string, content?: string, name?: string, sourceLabel?: string) => {
    const labels = readOpenFloatingNoteLabels();

    labels.forEach((label) => {
      try {
        if (sourceLabel && label === sourceLabel) return;
        const snapshot = readFloatingNoteSnapshot(label);
        if (!snapshot || snapshot.itemId !== itemId || snapshot.type !== 'text') return;

        const nextSnapshot = {
          ...snapshot,
          content: typeof content === 'string' ? content : snapshot.content,
          name: typeof name === 'string' ? name : snapshot.name,
          updatedAt: Date.now(),
        };

        localStorage.setItem(floatingNoteStorageKey(label), JSON.stringify(nextSnapshot));
        const payload = {
          itemId,
          ...(typeof content === 'string' ? { content } : {}),
          ...(typeof name === 'string' ? { name } : {}),
          updatedAt: Date.now(),
        };
        localStorage.setItem(FLOATING_NOTE_SOURCE_BRIDGE_KEY, JSON.stringify(payload));
        emitTo(label, 'floating-note-source-updated', payload).catch(() => {});
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
        emitTo(label, 'floating-note-source-updated', payload).catch(() => {});
      } catch (_) {}
    });
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

      setItems(prev => prev.map(i => {
        if (i.id !== itemId || i.type !== 'text') return i;
        const current: any = i;
        if (!hasContent) {
          return {
            ...i,
            remark: nextName,
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
            remark: hasName ? nextName : i.remark,
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
          remark: hasName ? nextName : i.remark,
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

      setItems(prev => prev.map(i => (
        i.id === itemId && i.type === 'text'
          ? { ...i, remark: nextName } as BufferItem
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
          thumbnail = String(await invoke('get_video_thumb', { path }) || '');
        } catch (_) {
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
      if (webImages.length > 0) {
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
        if (!stateRef.current.isAntiTouchMode) {
          setIsOpen(true);
          // 兜底：Tauri 原生监听如果仍然触发，也不要在已打开/钉住时重置窗口位置。
          if (!stateRef.current.isOpen && !isPinnedRef.current) {
            invoke('open_drawer', { width: drawerWidthRef.current, height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});
          }
        }
      } else if (type === 'leave') {
        setIsDraggingOver(false);
        if (!isPinnedRef.current && !showLaunchIntroRef.current && !isSplashVisibleRef.current && !showUpdateLogRef.current) setIsOpen(false);
      } else if (type === 'drop') {
        setIsDraggingOver(false);
        if (stateRef.current.isAntiTouchMode) return;
        // DOM/edge/native 网页图片 drop 之后，Tauri 可能还会紧接着派发一次临时文件 paths。
        // 这时不要再把临时文件当成本地图片加入抽屉，否则会绕过自定义网页缓存目录。
        if (Date.now() - lastWebImageDropAtRef.current < 1500) return;
        const paths = (event.payload as any).paths as string[];
        void addDroppedPaths(paths || []);
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
        void addDroppedPaths(paths);
      }
    }).then(f => unlistenFiles = f);
    listen('edge-web-image-dropped', (event: any) => {
      if (stateRef.current.isAntiTouchMode) return;
      const payload = event.payload as { url?: string; name?: string };
      if (payload?.url) addWebImageUrl(payload.url, payload.name);
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
    setFolders([...folders, newFolder]); setNewFolderName(''); setShowFolderModal(false); showToast('文件夹创建成功');
  };

  const handleDeleteFolder = (id: string) => {
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

  const moveSelectedItemsToFolder = (folderId?: string, folderName?: string) => {
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);
    const count = selectedIds.length;
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

  const startDrawerItemPointerDrag = (e: React.PointerEvent, itemId: string) => {
    if (e.button !== 0 || isSelectMode || isResizingCards) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest('button,input,textarea,select,a,[role="button"],[contenteditable="true"],[data-no-drag="true"],[title*="复制"],[title*="文件夹"],[title*="显示"],[aria-label]')) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let activated = false;
    let disposed = false;

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

      me.preventDefault();
    };

    const onUp = (me: PointerEvent) => {
      if (activated) {
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
    if (renameValue.trim()) { setFolders(folders.map(f => f.id === id ? { ...f, name: renameValue.trim() } : f)); showToast('文件夹已重命名'); }
    setEditingFolderId(null);
  };

  const handleCloseTextInput = () => { setShowTextInput(false); };

  const [drawerWidth, setDrawerWidth] = useState(() => {
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
  const drawerWidthRef = useRef(drawerWidth);
  const drawerHeightRef = useRef(drawerHeight);
  const pendingBoundsRef = useRef<{ width: number; height: number } | null>(null);
  const boundsFrameRef = useRef<number | null>(null);
  const boundsInvokeInFlightRef = useRef(false);
  const boundsSyncRequestedRef = useRef(false);

  useEffect(() => { drawerWidthRef.current = drawerWidth; }, [drawerWidth]);
  useEffect(() => { drawerHeightRef.current = drawerHeight; }, [drawerHeight]);

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
    if (!isStartupOverlayActive || snipMode.active) return;

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
  }, [isStartupOverlayActive, snipMode.active]);

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const copyLocalImageToClipboard = async (path: string) => {
    const source = (path || '').trim();
    if (!source) throw new Error('empty screenshot path');

    const copyOnce = async () => {
      let pluginError: unknown = null;
      let browserError: unknown = null;
      let backendError: unknown = null;

      // 先走 Tauri clipboard-manager。之前直接把 Uint8Array 传给 writeImage，
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

      // 兜底 1：浏览器 ClipboardItem。部分 WebView2 环境允许这样写入 PNG。
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

      // 兜底 2：原来的 Rust/PowerShell 后端复制。
      try {
        await invoke('copy_image', { dataUrl: source });
        return;
      } catch (err) {
        backendError = err;
        console.warn('backend copy_image failed:', err);
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

  const applyWindowBounds = (width: number, height: number) => {
    pendingBoundsRef.current = { width, height };
    if (boundsFrameRef.current !== null) return;

    boundsFrameRef.current = requestAnimationFrame(() => {
      boundsFrameRef.current = null;
      const next = pendingBoundsRef.current;
      if (!next || snipMode.active) return;
      pendingBoundsRef.current = null;

      if (boundsInvokeInFlightRef.current) {
        pendingBoundsRef.current = next;
        boundsSyncRequestedRef.current = true;
        return;
      }

      const mainWidth = next.width > MIN_DRAWER_WIDTH + EDGE_WIDTH ? next.width - EDGE_WIDTH : next.width;
      boundsInvokeInFlightRef.current = true;
      invoke('resize_drawer', {
        width: clamp(mainWidth, MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH),
        height: clamp(next.height, MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT),
      }).catch(() => {}).finally(() => {
        boundsInvokeInFlightRef.current = false;
        if (boundsSyncRequestedRef.current) {
          boundsSyncRequestedRef.current = false;
          const latest = pendingBoundsRef.current;
          if (latest) applyWindowBounds(latest.width, latest.height);
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
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    // 先同步隐藏抽屉内容，然后直接进入透明全屏截图层。
    // 不再预先 capture_screen + base64 渲染整屏图片，启动会比旧方案快很多。
    flushSync(() => {
      setIsOpen(false);
      setIsPinned(false);
      setDrawerState('closed');
      setSnipMode({ active: true, bg: '' });
    });

    await invoke('set_topmost', { topmost: false }).catch(() => {});
    await invoke('close_drawer', { mode: triggerModeRef.current }).catch(() => {});
    await invoke('hide_edge').catch(() => {});

    // 让 React 的透明遮罩先落到 DOM，再把 Tauri 主窗口切到全屏。
    await wait(16);
    await invoke('enter_snip_mode');
    await appWindow.show();
  } catch (err) {
    console.error('进入截图模式失败:', err);
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
    if (snipMode.active) return;

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
}, [isDrawerActive, snipMode.active]);

  // 兜底：只要前端状态已经是 closed，就再次把真实 Tauri 窗口压回 20px。
  // 这样即使上一轮动画/异步 resize 被打断，也不会留下一个透明的大命中框。
  useEffect(() => {
    if (snipMode.active || isDrawerActive || drawerState !== 'closed') return;
    invoke('close_drawer', { mode: triggerModeRef.current }).catch(() => {});
  }, [drawerState, isDrawerActive, snipMode.active]);

  // 尺寸变化只同步系统窗口大小，不重置抽屉动画状态。
useEffect(() => {
  if (snipMode.active || isResizingState.current || !isDrawerActive || drawerState === 'closed' || drawerState === 'closing') return;
  applyWindowBounds(drawerWidth + EDGE_WIDTH, drawerHeight);
}, [drawerWidth, drawerHeight, isDrawerActive, drawerState, snipMode.active]);




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
  setSelection(null);

  try {
    // 保持 snipMode.active = true，让全屏截图层继续盖住内容。
    // 先恢复 Tauri 窗口尺寸/位置，避免抽屉在全屏尺寸下短暂露出。
    await invoke('exit_snip_mode');

    if (reopen) {
      // 用 ref 里的最新尺寸，避免闭包拿到旧尺寸。
      await invoke('open_drawer', {
        width: drawerWidthRef.current,
        height: drawerHeightRef.current,
        mode: triggerModeRef.current,
      }).catch(() => {});

      flushSync(() => {
        setDrawerState('open');
        setIsOpen(true);
        setSnipMode({ active: false, bg: '' });
      });
    } else {
      await invoke('close_drawer', { mode: triggerModeRef.current }).catch(() => {});
      await invoke('show_edge', { height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});

      flushSync(() => {
        setDrawerState('closed');
        setIsOpen(false);
        setSnipMode({ active: false, bg: '' });
      });
    }

    await invoke('set_topmost', { topmost: true }).catch(() => {});
    await appWindow.show();
  } catch (err) {
    console.error('退出截图异常:', err);
    // 异常时也要退出截图层，避免界面卡在截图遮罩。
    setSnipMode({ active: false, bg: '' });
  }
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

  const confirmSnip = async () => {
    const currentSelection = selection;
    if (!currentSelection || currentSelection.w < 10 || currentSelection.h < 10) return exitSnip();

    const createdAt = Date.now();
    const placeholderId = Math.random().toString(36).substring(2, 9);
    const placeholderItem: BufferItem = {
      id: placeholderId,
      type: 'image',
      content: '截图处理中...',
      name: `截图_${createdAt}.png`,
      url: getSnipPlaceholderUrl(),
      createdAt,
      folderId: activeFolderId !== 'all' ? activeFolderId : undefined,
    };

    // 先把占位卡片放进抽屉；截图窗口仍然盖着，所以不会被截进去。
    // Rust 捕获到像素后会发 snip-area-captured，前端立即恢复抽屉，
    // 后续 PNG 保存/IPC 返回完成后再把占位图替换成真实截图。
    setItems(prev => [placeholderItem, ...prev]);
    setActiveTab('image');

    let restored = false;
    let unlistenCaptured: (() => void) | undefined;

    const restoreDrawerOnce = async () => {
      if (restored) return;
      restored = true;
      await exitSnip(true);
    };

    try {
      unlistenCaptured = await listen('snip-area-captured', () => {
        void restoreDrawerOnce();
      });

      const savedPath = await invoke<string>('capture_screen_area_to_file', {
        x: Math.round(currentSelection.x),
        y: Math.round(currentSelection.y),
        width: Math.round(currentSelection.w),
        height: Math.round(currentSelection.h),
      });

      if (unlistenCaptured) {
        unlistenCaptured();
        unlistenCaptured = undefined;
      }

      if (!restored) await restoreDrawerOnce();

      const assetUrl = convertFileSrc(savedPath);
      setItems(prev => prev.map(item => item.id === placeholderId ? {
        ...item,
        content: '截图内容',
        name: `截图_${createdAt}.png`,
        url: assetUrl,
        path: savedPath,
      } : item));
      void copyLocalImageToClipboard(savedPath)
        .then(() => showToast('✂️ 截图已自动复制到剪贴板'))
        .catch((err) => {
          console.warn('截图复制到剪贴板失败:', err);
          showToast('截图已保存，自动复制失败');
        });
    } catch (err) {
      if (unlistenCaptured) unlistenCaptured();
      console.error('截图选区捕获失败:', err);
      setItems(prev => prev.filter(item => item.id !== placeholderId));
      showToast('截图失败');
      await exitSnip(false);
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && snipMode.active) exitSnip(); };
    window.addEventListener('keydown', handleEsc);
    return () => { window.removeEventListener('keydown', handleEsc); };
  }, [snipMode.active]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedImage) setSelectedImage(null);
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


  const finishResize = () => {
    const nextWidth = clamp(drawerWidthRef.current, MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH);
    const nextHeight = clamp(drawerHeightRef.current, MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT);
    drawerWidthRef.current = nextWidth;
    drawerHeightRef.current = nextHeight;

    isResizingState.current = false;
    isGlobalMouseDown.current = false;
    setDrawerWidth(nextWidth);
    setDrawerHeight(nextHeight);
    applyWindowBounds(nextWidth + EDGE_WIDTH, nextHeight);
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
      if (showTextInput || showFolderModal || isSearchActive) return;
      const clipboardItems = e.clipboardData?.items; if (!clipboardItems) return;
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.startsWith('image/')) {
          const file = clipboardItems[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const url = ev.target?.result as string;
              const newItem = { id: Math.random().toString(36).substring(2, 9), type: 'image', content: '图片', name: `粘贴图 ${new Date().toLocaleTimeString()}.png`, url, createdAt: Date.now(), folderId: activeFolderId !== 'all' ? activeFolderId : undefined } as BufferItem;
              setItems(prev => [newItem, ...prev]);
              triggerAutoPaletteForItems([newItem]);
              setActiveTab('image'); setIsOpen(true);
            };
            reader.readAsDataURL(file);
          }
        } else if (clipboardItems[i].type === 'text/plain') {
          clipboardItems[i].getAsString((text: string) => {
            if (text.trim()) {
              setItems(prev => [createTextOrUrlItem(text, '文本片段'), ...prev]);
              setActiveTab('text'); setIsOpen(true);
            }
          });
        }
      }
    };
    window.addEventListener('paste', handlePaste); return () => window.removeEventListener('paste', handlePaste);
  }, [showTextInput, isSearchActive, showFolderModal, activeFolderId]);



  const finishLaunchIntro = (manualOrEvent?: boolean | React.MouseEvent) => {
    const manual = manualOrEvent === true || (typeof manualOrEvent === 'object' && !!manualOrEvent);

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
    invoke('set_startup_close_lock', { ms: 7000 }).catch(() => {});

    // 启动欢迎页期间临时钉住，避免任何自动关闭事件把抽屉收回。
    // 5 秒倒计时结束或用户手动跳过时，再在 finishLaunchIntro 里恢复普通打开态。
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

    const timer = window.setTimeout(() => finishLaunchIntro(false), 5000);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [showLaunchIntro]);

  const isTextEntryActive = () => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) return false;
    const tag = element.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
  };

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

  const scheduleAutoClose = (delay = 180) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      if (!isPointerInsideDrawerRef.current && !shouldBlockAutoClose()) {
        setIsOpen(false);
      }
    }, delay);
  };

  const keepDrawerOpenByPointer = () => {
    startupAutoCloseSuppressedRef.current = false;
    isPointerInsideDrawerRef.current = true;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleFloatingLayerPointerLeave = (e: React.PointerEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    isPointerInsideDrawerRef.current = false;
    if (drawerState === 'open' && !shouldBlockAutoClose()) scheduleAutoClose(180);
  };

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

  const getQuickAccessVisual = (item: BufferItem & { isDirectory?: boolean; isUrl?: boolean }) => {
    const ext = getFileExtension(item.name || item.path || item.content || '');
    const pathOrUrl = item.path || item.url || item.content || '';

    if (item.isDirectory) {
      return { icon: <FolderOpen className="w-5 h-5 text-amber-500 dark:text-amber-400" />, label: '文件夹' };
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
      setSelectedImage(item.url);
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

  return (
    <div
        className={`${isDark ? 'dark' : ''} w-screen h-screen bg-transparent relative overflow-hidden font-sans select-none flex items-center justify-start pointer-events-none`}
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
            onMouseUp={() => { isMouseDown.current = false; confirmSnip(); }}
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
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
          invoke('set_topmost', { topmost: true }).catch(() => {});
        }}
        onPointerMove={() => {
          isPointerInsideDrawerRef.current = true;
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
        }}
        onPointerLeave={(e) => {
          isPointerInsideDrawerRef.current = false;
          // 动画阶段的 pointerleave 很容易是元素移动造成的，不代表鼠标真的离开了抽屉。
          if (isStartupOverlayActive || drawerState !== 'open' || shouldBlockAutoClose()) return;

          const isLeftEdge = e.clientX <= 30;
          const isBottomEdge = e.clientY >= drawerHeight - 30;
          scheduleAutoClose(isLeftEdge || isBottomEdge ? 500 : 180);
        }}
      >
            {(isOpen || isPinned || !!selectedImage || !!selectedVideo || showHelp || showQR) && <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-emerald-400/50 z-[100001] transition-colors rounded-l-[30px]" onPointerDown={startResizingWidth} />}
            {(isOpen || isPinned || !!selectedImage || !!selectedVideo || showHelp || showQR) && <div className="absolute bottom-0 left-0 right-0 h-2 cursor-row-resize hover:bg-emerald-400/50 z-[100001] transition-colors rounded-b-[30px]" onPointerDown={startResizingHeight} />}
            {(isOpen || isPinned || !!selectedImage || !!selectedVideo || showHelp || showQR) && <div className="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize hover:bg-emerald-400/50 z-[100002] transition-colors rounded-bl-[30px]" onPointerDown={startResizingCorner} />}

            <div className="w-16 h-full bg-stone-100/60 dark:bg-stone-900/40 border-r border-stone-200/50 dark:border-stone-800/50 flex flex-col items-center py-4 z-10 shadow-[4px_0_12px_rgba(0,0,0,0.02)] shrink-0 overflow-hidden">
              {/* 主抽屉：固定在侧边栏顶部，不参与文件夹滚动 */}
              <div
                className="relative shrink-0 flex flex-col items-center w-full px-1 pt-1"
                data-folder-drop-id="all"
                data-folder-drop-name="主抽屉"
                onPointerEnter={() => handleDrawerFolderPointerEnter('all')}
                onPointerLeave={() => handleDrawerFolderPointerLeave('all')}
                onPointerUp={() => handleDrawerFolderPointerUp(undefined)}
                onDragEnter={(e) => handleDrawerItemDragOverFolder(e, 'all')}
                onDragOver={(e) => handleDrawerItemDragOverFolder(e, 'all')}
                onDragLeave={(e) => handleDrawerItemDragLeaveFolder(e, 'all')}
                onDrop={(e) => handleDrawerItemDropToFolder(e, undefined)}
              >
                <div
                  onClick={() => setActiveFolderId('all')}
                  className={`relative mb-1 w-10 h-10 rounded-[16px] flex items-center justify-center cursor-pointer transition-all shadow-sm ${dragOverFolderId === 'all' ? 'ring-2 ring-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 scale-105' : activeFolderId === 'all' ? 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900 shadow-md scale-105' : 'bg-white/65 dark:bg-stone-800/65 backdrop-blur-md text-stone-500 hover:bg-white dark:hover:bg-stone-700 hover:scale-105'}`}
                  title="主抽屉 (未分类)"
                >
                  <LayoutGrid className="w-5 h-5" />
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
                  {folders.map(folder => (
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
                        onClick={() => setActiveFolderId(folder.id)}
                        className={`relative mb-1 w-10 h-10 rounded-[16px] flex items-center justify-center cursor-pointer transition-all shadow-sm ${dragOverFolderId === folder.id ? 'ring-2 ring-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 scale-105' : activeFolderId === folder.id ? 'bg-emerald-500 text-white shadow-md scale-105' : 'bg-white/65 dark:bg-stone-800/65 backdrop-blur-md text-stone-500 hover:bg-emerald-50 dark:hover:bg-stone-700 hover:scale-105'}`}
                        title={folder.name}
                      >
                        <FolderOpen className={`w-5 h-5 ${activeFolderId === folder.id ? 'opacity-100' : 'opacity-80'}`} />
                        <span className="absolute -top-1.5 -right-1.5 bg-stone-800 dark:bg-stone-600 text-white text-[9px] px-1 min-w-[16px] text-center rounded-full font-bold shadow-sm pointer-events-none">
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
                          className={`text-[10px] w-14 text-center truncate px-0.5 cursor-text pb-1 ${activeFolderId === folder.id ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-stone-500 dark:text-stone-400 hover:text-emerald-500'}`}
                          title="双击或右键改名"
                        >
                          {folder.name}
                        </span>
                      )}
                    </div>
                  ))}

                  {/* 新建收纳夹按钮保留在文件夹区域底部，文件夹列表滚动到底即可看到 */}
                  <div className="relative shrink-0 flex flex-col items-center w-full mt-1">
                    <button
                      onClick={handleOpenFolderModal}
                      className="w-10 h-10 mb-1 rounded-[16px] flex items-center justify-center border-2 border-dashed border-stone-300 dark:border-stone-700 text-stone-400 hover:border-emerald-50 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all hover:scale-105 shrink-0"
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
                          ? 'bg-emerald-50 text-emerald-600 shadow-sm ring-1 ring-emerald-100 dark:bg-emerald-900/35 dark:text-emerald-300 dark:ring-emerald-800/55'
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
                      <SystemQuickAccessIcon title="桌面" icon={<Monitor className="w-5 h-5 text-emerald-500/90 dark:text-emerald-400/90" />} path="SYSTEM_DESKTOP" />
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
                                className="text-[10px] w-14 text-center truncate px-0.5 cursor-default pb-1 text-stone-500 dark:text-stone-400 group-hover/quick:text-emerald-500 dark:group-hover/quick:text-emerald-400"
                                title={quickName}
                              >
                                {quickName}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
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
                              ? (thumb ? <img src={thumb} className="w-full h-full object-cover rounded-[16px]" draggable={false} /> : <ImageIcon className="w-5 h-5 text-stone-500" />)
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
                                  className="absolute top-0 right-1 z-30 opacity-0 group-hover/note:opacity-100 bg-red-500 text-white rounded-full p-0.5 shadow-sm ring-2 ring-stone-100/85 dark:ring-stone-900/80 transition-opacity hover:scale-110"
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
                  className="p-4 border-b border-stone-200/50 dark:border-stone-800/50 flex flex-wrap justify-between items-start gap-2 bg-white/50 dark:bg-stone-900/50 relative cursor-move z-20"
                  onPointerDown={async (e) => {
                    if (e.button !== 0) return; // 仅左键
                    const target = e.target as HTMLElement | null;
                    // 标题栏按钮区允许自动换行；只有真正点到按钮/输入框时不拖动，按钮之间的空白仍可拖动。
                    if (target?.closest('button,input,textarea,select,a,[role="button"],[contenteditable="true"],[data-no-drag="true"]')) return;

                    setIsDraggingTitle(true);
                    isDraggingTitleRef.current = true;
                    isGlobalMouseDown.current = true;
                    // 移动抽屉时自动进入钉住状态：拖到哪里就固定在哪里，
                    // 只有点击右上角“复位”才取消钉住并回到触发边。
                    setIsPinned(true);
                    isPinnedRef.current = true;
                    if (closeTimerRef.current) {
                      clearTimeout(closeTimerRef.current);
                      closeTimerRef.current = null;
                    }
                    isPointerInsideDrawerRef.current = true;
                    setIsOpen(true);
                    setDrawerState('open');
                    invoke('toggle_pin', { pinned: true }).catch(()=>{});
                    invoke('set_topmost', { topmost: true }).catch(() => {});

                    try {
                      // 移动抽屉时自动钉住：拖到哪里就固定在哪里。
                      // 注意：拖拽结束后不要再调用 resize_drawer，否则会被后端重新吸附回最右侧。
                      await appWindow.setResizable(true);
                      await appWindow.startDragging();
                      await appWindow.setResizable(false);
                    } catch(err) {
                       console.error(err);
                    } finally {
                      await appWindow.setResizable(false).catch(() => {});
                      setIsDraggingTitle(false);
                      isDraggingTitleRef.current = false;
                      isGlobalMouseDown.current = false;
                    }
                  }}
                >
                  <h2 className="font-semibold text-stone-800 dark:text-stone-100 flex items-center gap-1.5 min-w-[140px] max-w-full relative pointer-events-none">
                    {activeFolderId === 'all' ? <Camera className="w-4 h-4 text-stone-400 dark:text-stone-500" /> : <FolderOpen className="w-4 h-4 text-emerald-500" />}
                    {activeFolderId === 'all' ? '灵感抽屉' : folders.find(f => f.id === activeFolderId)?.name || '未知分类'}

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
                                const deletableIds = items.filter(i => selectedIds.includes(i.id) && !i.isQuickAccess).map(i => i.id);
                                setConfirmDialog({ isOpen: true, title: '批量删除', message: `确定删除？`, onConfirm: () => { setItems(prev => prev.filter(i => !deletableIds.includes(i.id))); setSelectedIds([]); setIsSelectMode(false); setShowMoveFolderModal(false); setConfirmDialog(prev => ({...prev, isOpen: false})); } });
                              }}
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-[14px] hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors shadow-sm"
                            ><Trash2 className="w-3.5 h-3.5" /> 删 ({selectedIds.length})</button>
                          </>
                        )}
                        <button onClick={() => { setIsSelectMode(false); setSelectedIds([]); setShowMoveFolderModal(false); }} className="text-xs font-medium px-2.5 py-1.5 bg-white/65 dark:bg-stone-800/65 backdrop-blur-md rounded-[14px] text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors shadow-sm">取消</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setIsSelectMode(true); setSelectedIds([]); setShowSettings(false); setIsSearchActive(false); }}
                          className="p-1.5 rounded-[14px] transition-colors cursor-pointer shadow-sm bg-white/65 text-stone-500 dark:bg-stone-800/65 backdrop-blur-md dark:text-stone-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                          title="多选"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={toggleSearch} className={`p-1.5 rounded-[14px] transition-colors cursor-pointer shadow-sm ${isSearchActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-white/65 text-stone-500 dark:bg-stone-800/65 backdrop-blur-md dark:text-stone-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'}`} title="搜索 (Ctrl+F)">
                          <Search className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={toggleSettings} className={`p-1.5 rounded-[14px] transition-colors cursor-pointer shadow-sm ${showSettings ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-white/65 text-stone-500 dark:bg-stone-800/65 backdrop-blur-md dark:text-stone-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'}`} title="设置与帮助">
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={handleTogglePin} className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-[14px] transition-colors cursor-pointer shadow-sm ${isPinned ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-white/65 text-stone-500 dark:bg-stone-800/65 backdrop-blur-md dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'}`}>
                          {isPinned ? <RotateCcw className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />} {isPinned ? '复位' : '钉住'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="px-2 py-2 flex flex-wrap items-center gap-1.5 border-b border-stone-200/50 dark:border-stone-800/50 bg-stone-50/50 dark:bg-stone-900/50 z-10 shrink-0" onMouseDown={e => e.stopPropagation()}>
                  {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${activeTab === tab.id ? 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900 shadow-sm' : 'bg-transparent text-stone-500 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800/50'}`}>
                      <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? 'opacity-100' : 'opacity-70'}`} />{tab.label}
                    </button>
                  ))}
                </div>
                <AnimatePresence>
                  {isSearchActive && (
                    <motion.div
                      initial={isShortcutReveal ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={isShortcutReveal ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }}
                      className="overflow-hidden z-20 shrink-0 will-change-transform" onMouseDown={e => e.stopPropagation()}
                    >
                      <div className="px-4 py-2 bg-stone-50/50 dark:bg-stone-900/50 border-b border-stone-200/50 dark:border-stone-800/50">
                        <div className="relative group">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input
                            ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索灵感、文件、备注标签..."
                            className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-[16px] pl-9 pr-8 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
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
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecording ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecording(true); setIsRecordingSnip(false); setIsRecordingText(false); setIsRecordingSearch(false); setIsRecordingTrigger(false); }} onKeyDown={(e) => { if (isRecording) handleRecordShortcut(e, (s: string) => { setShortcut(s); setIsRecording(false); }, 'update-shortcut'); }} onBlur={() => setIsRecording(false)}>{isRecording ? '请按键...' : shortcut}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">极速截图</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingSnip ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingSnip(true); setIsRecording(false); setIsRecordingText(false); setIsRecordingSearch(false); setIsRecordingTrigger(false); }} onKeyDown={(e) => { if (isRecordingSnip) handleRecordShortcut(e, (s: string) => { setSnipShortcut(s); setIsRecordingSnip(false); }, 'update-snip-shortcut'); }} onBlur={() => setIsRecordingSnip(false)}>{isRecordingSnip ? '请按键...' : snipShortcut}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">快速记录灵感</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingText ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingText(true); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingSearch(false); setIsRecordingTrigger(false); }} onKeyDown={(e) => { if (isRecordingText) handleRecordShortcut(e, (s: string) => { setTextShortcut(s); setIsRecordingText(false); }, 'update-text-shortcut'); }} onBlur={() => setIsRecordingText(false)}>{isRecordingText ? '请按键...' : textShortcut}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">全局搜索唤出</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingSearch ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingSearch(true); setIsRecordingText(false); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingTrigger(false); }} onKeyDown={(e) => { if (isRecordingSearch) handleRecordShortcut(e, (s: string) => { setSearchShortcut(s); setIsRecordingSearch(false); }, 'update-search-shortcut'); }} onBlur={() => setIsRecordingSearch(false)}>{isRecordingSearch ? '请按键...' : searchShortcut}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">切换触发入口</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingTrigger ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingTrigger(true); setIsRecordingSearch(false); setIsRecordingText(false); setIsRecording(false); setIsRecordingSnip(false); }} onKeyDown={(e) => { if (isRecordingTrigger) handleRecordShortcut(e, (s: string) => { setTriggerShortcut(s); setIsRecordingTrigger(false); }, 'update-trigger-shortcut'); }} onBlur={() => setIsRecordingTrigger(false)}>{isRecordingTrigger ? '请按键...' : triggerShortcut}</button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="bg-white/75 dark:bg-stone-800/75 rounded-[22px] border border-white/60 dark:border-stone-700/60 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl">
                          <button onClick={() => setActiveSettingCategory(prev => prev === 'ai' ? '' : 'ai')} className="w-full flex items-center justify-between p-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Sparkles className="w-4 h-4 text-amber-500"/> 配色算法 / AI 炼金接口</span>
                            <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${activeSettingCategory === 'ai' ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {activeSettingCategory === 'ai' && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15, ease: "easeOut" }} className="overflow-hidden will-change-transform">
                                <div className="px-3 pb-3 pt-1 flex flex-col gap-2.5 border-t border-stone-100 dark:border-stone-700/50">
                                  <div className="rounded-[18px] bg-amber-50/70 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-800/40 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:text-amber-200">
                                    不填写 API Key 时，只用本地算法从图片像素中提取配色；选择硅基流动并填写 API Key 后，可调用硅基流动视觉模型生成 CMF、造型语言、材料建议、可借鉴点和不适合照搬点。可点击“刷新视觉模型”从 /v1/models 读取当前账号可用模型。
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

                <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600 [&::-webkit-scrollbar-thumb]:rounded-full relative flex flex-col">
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
                          <button
                            onClick={closeAllFloatingNotes}
                            disabled={openFloatingNoteCount === 0}
                            className="shrink-0 rounded-[16px] bg-stone-100 px-3 py-2 text-[11px] font-bold text-stone-600 transition-colors hover:bg-stone-200 disabled:opacity-45 disabled:hover:bg-stone-100 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                          >
                            全部删除
                          </button>
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
                                      <img src={thumb} className="h-full w-full object-cover" draggable={false} />
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
                  {activeTab !== 'notes' && items.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-stone-400 dark:text-stone-600 space-y-3 opacity-80 px-6">
                      <Download className="w-7 h-7 opacity-70" />
                      <div className="space-y-2 text-center">
                        <p className="text-xs font-bold text-stone-500 dark:text-stone-400">把灵感先丢进抽屉</p>
                        <p className="text-[11px] leading-5">拖入文件/图片/网页图 · {snipShortcut} 截图 · {textShortcut} 快速记录 · {searchShortcut} 搜索</p>
                        <p className="text-[11px] leading-5">侧边小条：悬停展开，按住左键经过不触发，Ctrl + 左键可移动位置。</p>
                        <p className="text-[11px] leading-5">悬浮方块：默认右下角，悬停 0.8s 展开，左键拖动位置，{triggerShortcut} 切换入口。</p>
                      </div>
                    </div>
                  )}
                  {activeTab !== 'notes' && items.length > 0 && displayItems.length === 0 && activeTab !== 'alchemy' && (
                    <div className="flex-1 flex flex-col items-center justify-center text-stone-400 dark:text-stone-600 space-y-3 opacity-80 px-6">
                      <Search className="w-7 h-7 opacity-70" />
                      <div className="space-y-2 text-center">
                        <p className="text-xs font-bold text-stone-500 dark:text-stone-400">当前分类没有匹配卡片</p>
                        <p className="text-[11px] leading-5">试试切到“全部”、清空搜索，或把素材拖到当前文件夹。</p>
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
                  {activeTab !== 'notes' && displayItems.length > 0 && (
                    <div
                      className="grid gap-4 items-start"
                      style={activeTab === 'alchemy'
                        ? { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${ALCHEMY_CARD_WIDTH}px), 1fr))` }
                        : { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardWidth}px), 1fr))` }}
                    >
                      <AnimatePresence mode={activeTab === 'alchemy' ? 'sync' : 'popLayout'}>
                        {displayItems.map(item => (
                          <div
                            key={item.id}
                            data-alchemy-card-id={item.id}
                            className={activeTab === 'alchemy' ? 'transition-opacity' : `${draggingItemId === item.id ? 'opacity-50 scale-[0.99]' : ''} transition-opacity`}
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                            onPointerDown={(e) => { if (activeTab !== 'alchemy') startDrawerItemPointerDrag(e, item.id); }}
                          >
                            {activeTab === 'alchemy' ? (
                              <AlchemyDrawerCard
                                item={item as AlchemyBufferItem}
                                active={selectedAlchemyItemId === item.id}
                                onSelect={() => setSelectedAlchemyItemId(prev => prev === item.id ? null : item.id)}
                                onAlchemy={() => runAlchemyAnalysis(item as AlchemyBufferItem)}
                                onPreview={() => {
                                  const source = item.url || (item.path ? convertFileSrc(item.path) : '');
                                  if (source) setSelectedImage(source);
                                }}
                                onRemove={() => setItems(prev => prev.filter(i => i.id !== item.id))}
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
                                    setItems(prev => prev.filter(i => i.id !== item.id));
                                  }}
                                  onRemoveFromFolder={() => {
                                    setItems(prev => prev.map(i => i.id === item.id ? { ...i, folderId: undefined } : i));
                                  }}
                                  onTogglePin={() => setItems(prev => prev.map(i => i.id === item.id ? { ...i, isQuickAccess: !i.isQuickAccess } : i))}
                                  onImageClick={(url: string) => setSelectedImage(url)}
                                  onVideoClick={() => {
                                    if (item.path) setSelectedVideo({ url: convertFileSrc(item.path), path: item.path });
                                  }}
                                  isSelectMode={isSelectMode} isSelected={selectedIds.includes(item.id)}
                                  onToggleSelect={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                                  onUpdateRemark={(id: string, newRemark: string) => {
                                    setItems(prev => prev.map(i => i.id === id ? { ...i, remark: newRemark } : i));
                                    if (item.type === 'text') broadcastFloatingNoteTitleUpdate(id, newRemark);
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
                                  onCreateFloatingNote={createFloatingNote}
                                  showAlchemy={isAlchemyCandidate(item as AlchemyBufferItem)}
                                  onAlchemy={() => runAiAlchemyFromCard(item as AlchemyBufferItem)}
                                />
                              </>
                            )}
                          </div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                  {activeTab !== 'notes' && displayItems.length > 0 && (
                    <div className="mt-4 mb-1 rounded-[22px] bg-stone-50/70 dark:bg-stone-900/30 border border-stone-200/60 dark:border-stone-700/60 px-3 py-2 text-[11px] leading-5 text-stone-500 dark:text-stone-400">
                      提示：拖入文件/图片/网页图添加素材；按住左键经过侧边小条不展开；Ctrl + 左键拖动小条位置；{triggerShortcut} 切换触发入口。
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {activeTab !== 'notes' && !showTextInput && (
                    <motion.button
                      initial={isShortcutReveal ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={isShortcutReveal ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                      onClick={handleOpenTextInput}
                      className="absolute bottom-6 right-6 z-40 bg-emerald-500 hover:bg-emerald-600 text-white p-3.5 rounded-full shadow-[0_8px_16px_rgba(16,185,129,0.3)] transition-transform hover:scale-105 active:scale-95 will-change-transform"
                      title="写下灵感"
                    ><Edit3 className="w-5 h-5" /></motion.button>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showTextInput && (
                    <motion.div initial={isShortcutReveal ? false : { opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} transition={isShortcutReveal ? { duration: 0 } : { type: 'tween', duration: 0.2, ease: "easeOut" }} className="absolute bottom-6 left-6 right-6 z-50 bg-white/90 dark:bg-stone-800/90 backdrop-blur-2xl rounded-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.16)] border border-stone-200/60 dark:border-stone-700/60 p-4 flex flex-col gap-3 will-change-transform" onMouseDown={e => e.stopPropagation()}>
                      <div className="flex justify-between items-center px-1">
                        <span className="text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center gap-1.5"><Edit3 className="w-4 h-4 text-emerald-500" /> 记录灵感</span>
                        <button onClick={handleCloseTextInput} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                      <textarea
                        autoFocus value={quickText} onChange={e => setQuickText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (quickText.trim()) {
                              const newItem: BufferItem = createTextOrUrlItem(quickText, '灵感笔记');
                              setItems(prev => [newItem, ...prev]); setActiveTab('text'); setQuickText(''); handleCloseTextInput();
                            }
                          }
                          if (e.key === 'Escape') handleCloseTextInput();
                        }}
                        placeholder={`随便写点什么...\n(Enter 提交，Shift+Enter 换行)`}
                        className="w-full bg-stone-50/50 dark:bg-stone-900/50 rounded-[20px] p-3 border border-stone-200/50 dark:border-stone-700/50 outline-none resize-none text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 h-24 focus:ring-2 focus:ring-emerald-500/20 transition-all [&::-webkit-scrollbar]:hidden"
                      />
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] text-stone-400 font-mono font-medium">{quickText.length} 字</span>
                        <button
                          onClick={() => {
                            if (quickText.trim()) {
                              const newItem: BufferItem = createTextOrUrlItem(quickText, '灵感笔记');
                              setItems(prev => [newItem, ...prev]); setActiveTab('text'); setQuickText(''); handleCloseTextInput();
                            }
                          }}
                          disabled={!quickText.trim()}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-stone-200 dark:disabled:bg-stone-700 disabled:text-stone-400 text-white text-xs font-medium rounded-[16px] transition-colors shadow-sm disabled:shadow-none"
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
                setSelectedImage(null);
                return;
              }
              if (e.button === 2) startPreviewWindowDrag(e);
            }}
            onMouseDown={(e) => {
              if (e.button === 0 && e.target === e.currentTarget) {
                setSelectedImage(null);
                return;
              }
              if (e.button === 2) startPreviewWindowDrag(e);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-emerald-400/50 z-[10000] transition-colors" onMouseDown={e => e.stopPropagation()} onPointerDown={startResizingWidth} />
            <div className="absolute bottom-0 left-0 right-0 h-2 cursor-row-resize hover:bg-emerald-400/50 z-[10000] transition-colors" onMouseDown={e => e.stopPropagation()} onPointerDown={startResizingHeight} />
            <div className="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize hover:bg-emerald-400/50 z-[10001] transition-colors rounded-bl-[30px]" onMouseDown={e => e.stopPropagation()} onPointerDown={startResizingCorner} />

            <button
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedImage(null); }}
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
                  setSelectedImage(null);
                  return;
                }
                if (e.button === 2) {
                  startPreviewWindowDrag(e);
                  return;
                }
              }}
              onMouseDown={(e) => {
                if (e.button === 0 && e.target === e.currentTarget) {
                  setSelectedImage(null);
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
        {confirmDialog.isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] rounded-[30px] overflow-hidden bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto" onPointerEnter={keepDrawerOpenByPointer} onPointerMove={keepDrawerOpenByPointer} onPointerLeave={handleFloatingLayerPointerLeave}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-[320px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-4">
              <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100">{confirmDialog.title || '确认操作'}</h3>
              <p className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{confirmDialog.message || '确定继续吗？'}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))} className="px-3 py-1.5 rounded-[16px] text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">取消</button>
                <button onClick={() => confirmDialog.onConfirm()} className="px-3 py-1.5 rounded-[16px] text-xs bg-red-500 text-white">确定</button>
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
            onMouseDown={() => finishLaunchIntro(true)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.32, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-[380px] overflow-hidden rounded-[32px] bg-white/92 dark:bg-stone-900/94 border border-white/70 dark:border-stone-700/70 shadow-2xl p-5"
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-stone-200/80 dark:bg-stone-700/80 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-amber-300 via-emerald-300 to-blue-300"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 5, ease: 'linear' }}
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
                      <h2 className="mt-1 text-lg font-black text-stone-900 dark:text-stone-50">灵感抽屉 v3.0</h2>
                    </div>
                    <button onClick={() => finishLaunchIntro(true)} className="p-2 rounded-full text-stone-400 hover:text-red-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors" title="跳过启动动画">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">启动时从侧边滑出，5 秒后自动进入抽屉，也可以立即跳过。</p>
                </div>
              </div>

              <div className="mt-5 space-y-2.5 text-xs leading-5 text-stone-600 dark:text-stone-300">
                <div className="rounded-[20px] bg-stone-50/90 dark:bg-stone-800/70 border border-stone-100 dark:border-stone-700/70 p-3">
                  <p className="font-bold text-stone-800 dark:text-stone-100 mb-1">本次更新</p>
                  <p>桌面便签更完整：卡片可以固定成独立便签，文字、图片、视频和文件都能留在桌面。</p>
                </div>
                <div className="rounded-[20px] bg-stone-50/90 dark:bg-stone-800/70 border border-stone-100 dark:border-stone-700/70 p-3">
                  <p>文字便签支持三档尺寸、颜色切换、日程模式和实时编辑，同步回抽屉里的原文本卡片。</p>
                  <p className="mt-1">多个便签靠近时会轻微磁吸对齐，右键便签可以打开抽屉或关闭窗口。</p>
                </div>
              </div>

              <button onClick={() => finishLaunchIntro(true)} className="mt-5 w-full py-2.5 rounded-[22px] bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-black shadow-lg hover:scale-[1.01] active:scale-[0.98] transition-transform">
                立即进入抽屉
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
                  <p>点击图片进入大图预览；点击视频可以直接在抽屉里播放；点击普通文件会使用系统默认软件打开。</p>
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
                  <p>便签可以同时打开多个。单击并拖动便签非编辑区域可以移动位置；右下角手柄可调整大小；滚轮可以缩放便签内容，图片会跟随一起缩放。</p>
                  <p>文字便签默认作为完整便签显示，双击文字区域进入编辑；修改内容会同步回抽屉里的原文本卡片。右键便签可打开抽屉或关闭当前便签，鼠标进入便签时会显示置顶按钮。</p>
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
                <span className="text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-amber-500" /> 便签使用指南</span>
                <button onClick={closeUpdateLog} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-2 text-xs leading-5 text-stone-600 dark:text-stone-300">
                <p>鼠标悬停卡片，点击右上角的便签按钮，可以把文字、图片、视频或文件固定成独立桌面便签。</p>
                <p>文字便签双击正文即可编辑，修改会实时同步回抽屉里的原文本卡片；双击标题栏可以在大卡片、条状和小图标三档之间切换。</p>
                <p>悬浮按钮里可以切换文字便签颜色，也可以切换日程模式；从日程切回文字后仍会继续同步原卡片。</p>
                <p>便签可以拖动、缩放、滚轮缩放内容、置顶；多个便签靠近时会轻微磁吸对齐，方便排成一组。</p>
                <p>右键便签可以打开抽屉或关闭当前便签。关闭后仍可在抽屉左侧的便签栏里找回和管理。</p>
              </div>
              <button onClick={closeUpdateLog} className="mt-4 w-full py-2 rounded-[20px] bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-bold">知道了</button>
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
  if (label === 'note' || (typeof label === 'string' && label.startsWith('note_'))) return <FloatingNoteHost />;
  return <MainApp />;
}
