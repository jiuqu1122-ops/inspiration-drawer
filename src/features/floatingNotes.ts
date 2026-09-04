import { BufferItem, Folder, FloatingNoteSnapshot } from '../types';
import { fileUrlToLocalPath } from '../utils/localMediaPaths';
import {
  isTemporaryImageSource,
  localPathFromAssetUrl,
  resolveLocalImageSource,
} from '../utils/localImageSource';
import { clamp } from './common';

const MAX_FLOATING_NOTE_COUNT = 8;
const FLOATING_NOTE_LABELS = Array.from({ length: MAX_FLOATING_NOTE_COUNT }, (_, idx) => `note_${idx + 1}`);
const OPEN_FLOATING_NOTES_STORAGE_KEY = 'drawer_open_floating_notes';
const FLOATING_NOTE_TEXT_BRIDGE_KEY = 'drawer_floating_note_text_bridge';
const FLOATING_NOTE_TITLE_BRIDGE_KEY = 'drawer_floating_note_title_bridge';
const FLOATING_NOTE_SOURCE_BRIDGE_KEY = 'drawer_floating_note_source_bridge';
const FLOATING_NOTE_DESTROY_BRIDGE_KEY = 'drawer_floating_note_destroy_bridge';
const FOLDERS_CACHE_STORAGE_KEY = 'drawer_folders_cache';
type TextFloatingNoteSizeMode = 'large' | 'medium';
const TEXT_FLOATING_NOTE_SIZES: Record<TextFloatingNoteSizeMode, { width: number; height: number; label: string }> = {
  large: { width: 360, height: 360, label: '默认' },
  medium: { width: 360, height: 56, label: '条状' },
};
const TEXT_FLOATING_NOTE_SIZE_ORDER: TextFloatingNoteSizeMode[] = ['large', 'medium'];
const IMAGE_FLOATING_NOTE_MAX_WIDTH = 460;
const IMAGE_FLOATING_NOTE_MAX_HEIGHT = 420;
const IMAGE_FLOATING_NOTE_BASE_AREA = 360 * 320;
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
  { id: 'charcoal', label: '深灰', swatch: '#3d3d3a', body: '#3f3f3c', header: '#4a4945', border: 'rgba(255, 255, 255, 0.14)', text: '#fff8e8', icon: '#ffe8a8', darkBody: '#222220', darkHeader: '#2c2c2a', darkBorder: 'rgba(255, 255, 255, 0.12)', darkText: '#fff8e8', darkIcon: '#ffe8a8' },
];

const getTextFloatingNoteColor = (colorId?: string) => (
  TEXT_FLOATING_NOTE_COLORS.find(color => color.id === colorId) || TEXT_FLOATING_NOTE_COLORS[0]
);

const resolveTextFloatingNoteSizeMode = (width?: number, height?: number): TextFloatingNoteSizeMode => {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return 'large';

  return h <= 96 ? 'medium' : 'large';
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
      width: Number.isFinite(Number(parsed.width)) ? Math.max(48, Number(parsed.width)) : undefined,
      height: Number.isFinite(Number(parsed.height)) ? Math.max(48, Number(parsed.height)) : undefined,
      mediumWidth: Number.isFinite(Number(parsed.mediumWidth)) ? Math.max(48, Number(parsed.mediumWidth)) : undefined,
    };
  } catch (_) {
    return {};
  }
};

const writeFloatingNoteViewState = (itemId: string | undefined, patch: { zoom?: number; width?: number; height?: number; mediumWidth?: number }) => {
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

const readCachedFolders = (): Folder[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(FOLDERS_CACHE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((folder): folder is Folder => (
          folder &&
          typeof folder.id === 'string' &&
          typeof folder.name === 'string'
        ))
      : [];
  } catch (_) {
    return [];
  }
};

const getFolderTagIds = (folderId?: string, tagIds?: string[]) => {
  const ids = Array.isArray(tagIds) ? tagIds.filter(Boolean) : [];
  if (ids.length > 0) return ids;
  return folderId ? [folderId] : [];
};

const normalizeStableImagePath = (value?: unknown) => {
  const raw = String(value || '').trim();
  if (!raw || isTemporaryImageSource(raw)) return '';
  return localPathFromAssetUrl(raw)
    || (/^file:/i.test(raw) ? fileUrlToLocalPath(raw) : '')
    || raw;
};

const getLocalPathFromDisplaySource = (value?: unknown) => {
  const raw = String(value || '').trim();
  if (!raw || isTemporaryImageSource(raw)) return '';
  const assetPath = localPathFromAssetUrl(raw);
  if (assetPath) return assetPath;
  if (/^file:/i.test(raw)) return fileUrlToLocalPath(raw);
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[a-zA-Z]:[\\/]/.test(raw)) return '';
  return raw;
};

const getStableFloatingNoteImageFields = (
  item: Pick<BufferItem, 'path' | 'url' | 'thumbnail'>,
) => {
  const rawUrl = String(item.url || '').trim();
  const rawThumbnail = String(item.thumbnail || '').trim();
  const urlLocalPath = getLocalPathFromDisplaySource(rawUrl);
  const thumbnailLocalPath = getLocalPathFromDisplaySource(rawThumbnail);
  const storedPath = normalizeStableImagePath(item.path)
    || urlLocalPath
    || thumbnailLocalPath;

  return {
    path: storedPath || undefined,
    url: rawUrl && !urlLocalPath && !isTemporaryImageSource(rawUrl) ? rawUrl : undefined,
    thumbnail: rawThumbnail && !thumbnailLocalPath && !isTemporaryImageSource(rawThumbnail)
      ? rawThumbnail
      : undefined,
  };
};

const makeFloatingNoteSnapshot = (item: BufferItem): FloatingNoteSnapshot => ({
  id: `note_${item.id}`,
  itemId: item.id,
  type: item.type,
  name: item.type === 'text' ? (item.remark || item.name || item.content) : item.name,
  content: item.content,
  ...(item.type === 'image'
    ? getStableFloatingNoteImageFields(item)
    : { path: item.path, url: item.url, thumbnail: item.thumbnail }),
  folderId: item.folderId,
  tagIds: getFolderTagIds(item.folderId),
  ...readFloatingNoteViewState(item.id),
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as FloatingNoteSnapshot);

const getImageNoteSource = (item: Pick<BufferItem, 'url' | 'thumbnail' | 'path'>) => (
  resolveLocalImageSource(item.path || item.url || item.thumbnail)
);

const getFloatingNoteImageSourceDetails = (
  note?: FloatingNoteSnapshot | null,
  asset?: Partial<BufferItem> | null,
) => {
  const originalSource = String(
    asset?.sourceUrl
    || asset?.originalUrl
    || asset?.path
    || note?.path
    || asset?.url
    || note?.url
    || '',
  ).trim();
  const storedSource = String(note?.path || note?.url || note?.thumbnail || '').trim();
  const selectedSource = String(
    asset?.path
    || note?.path
    || asset?.url
    || note?.url
    || asset?.thumbnail
    || note?.thumbnail
    || '',
  ).trim();

  return {
    noteId: note?.id || '',
    assetId: note?.itemId || '',
    originalSource,
    storedSource,
    storedPath: note?.path || '',
    storedUrl: note?.url || '',
    resolvedSource: resolveLocalImageSource(selectedSource),
  };
};

const fitImageFloatingNoteSize = (aspect: number) => {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let width = Math.sqrt(IMAGE_FLOATING_NOTE_BASE_AREA * safeAspect);
  let height = width / safeAspect;

  if (width > IMAGE_FLOATING_NOTE_MAX_WIDTH) {
    width = IMAGE_FLOATING_NOTE_MAX_WIDTH;
    height = width / safeAspect;
  }
  if (height > IMAGE_FLOATING_NOTE_MAX_HEIGHT) {
    height = IMAGE_FLOATING_NOTE_MAX_HEIGHT;
    width = height * safeAspect;
  }

  return {
    width: Math.max(48, Math.round(width)),
    height: Math.max(48, Math.round(height)),
  };
};

const readImageAspect = (item: Pick<BufferItem, 'url' | 'thumbnail' | 'path' | 'type'>) => new Promise<number>((resolve) => {
  if (item.type !== 'image') {
    resolve(1);
    return;
  }

  const src = getImageNoteSource(item);
  if (!src) {
    resolve(1);
    return;
  }

  const img = new Image();
  img.onload = () => {
    const width = img.naturalWidth || img.width || 1;
    const height = img.naturalHeight || img.height || 1;
    resolve(width / height);
  };
  img.onerror = () => resolve(1);
  img.src = src;
});

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

export {
  FLOATING_NOTE_LABELS,
  MAX_FLOATING_NOTE_COUNT,
  OPEN_FLOATING_NOTES_STORAGE_KEY,
  FLOATING_NOTE_TEXT_BRIDGE_KEY,
  FLOATING_NOTE_TITLE_BRIDGE_KEY,
  FLOATING_NOTE_SOURCE_BRIDGE_KEY,
  FLOATING_NOTE_DESTROY_BRIDGE_KEY,
  FOLDERS_CACHE_STORAGE_KEY,
  TEXT_FLOATING_NOTE_SIZES,
  TEXT_FLOATING_NOTE_SIZE_ORDER,
  TEXT_FLOATING_NOTE_COLORS,
  getTextFloatingNoteColor,
  resolveTextFloatingNoteSizeMode,
  floatingNoteStorageKey,
  readFloatingNoteViewState,
  writeFloatingNoteViewState,
  readOpenFloatingNoteLabels,
  writeOpenFloatingNoteLabels,
  rememberOpenFloatingNoteLabel,
  forgetOpenFloatingNoteLabel,
  deleteFloatingNoteSnapshot,
  readCachedFolders,
  getFolderTagIds,
  getStableFloatingNoteImageFields,
  makeFloatingNoteSnapshot,
  getImageNoteSource,
  getFloatingNoteImageSourceDetails,
  fitImageFloatingNoteSize,
  readImageAspect,
  readFloatingNoteSnapshot,
};

export type {
  TextFloatingNoteSizeMode,
  TextFloatingNoteColorId,
  TextFloatingNoteColorPreset,
};
