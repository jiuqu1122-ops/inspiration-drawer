import type { BufferItem } from '../types';

export const isCanvasImageFileName = (value?: string) => /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(value || '');
export const isCanvasVideoFileName = (value?: string) => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(value || '');
export const isCanvasAudioFileName = (value?: string) => /\.(mp3|wav|aac|flac|m4a|ogg|opus|aiff|wma)$/i.test(value || '');
export const isCanvasTemplateJsonFileName = (value?: string) => /\.json$/i.test((value || '').replace(/\0+$/g, '').trim());
export const isCanvasWorkflowReadableTextFileName = (value?: string) => (
  /\.(txt|md|markdown|json|jsonl|csv|tsv|ya?ml|xml|html?|css|mjs|cjs|js|jsx|ts|tsx)$/i.test(value || '')
);

export const fileUrlToLocalPath = (value: string) => {
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

export const normalizeLocalDragPath = (value?: string | null) => {
  const raw = (value || '').replace(/\0+$/g, '').trim().replace(/^"|"$/g, '');
  if (!raw) return '';
  if (/^file:/i.test(raw)) {
    return fileUrlToLocalPath(raw) || raw;
  }
  return raw
    .replace(/^\\\?\\(?=[a-zA-Z]:\\)/, '')
    .replace(/^\?\\(?=[a-zA-Z]:\\)/, '');
};

export const isDrawerLocalDeleteCandidate = (value?: unknown) => {
  const raw = String(value || '').trim();
  if (!raw || /^data:/i.test(raw)) return false;
  if (/^https?:\/\//i.test(raw) && !raw.includes('asset.localhost')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^file:/i.test(raw) && !/^asset:/i.test(raw) && !raw.includes('asset.localhost')) return false;
  return true;
};

export const getBufferItemLocalPaths = (item: BufferItem) => {
  if (item.type === 'text') return [];
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
    const eagleSourcePath = normalizeLocalDragPath((rawItem as any).eagleSourcePath || '');
    if (eagleSourcePath && normalized === eagleSourcePath) return paths;
    if (!normalized || seen.has(normalized)) return paths;
    seen.add(normalized);
    paths.push(normalized);
    return paths;
  }, []);
};

export const getDrawerImageLocalDeletePaths = (item: BufferItem) => (
  item.type === 'image' ? getBufferItemLocalPaths(item) : []
);

export const getCanvasLocalPathsFromDataTransfer = (dt?: DataTransfer | null) => {
  if (!dt) return [];
  const paths: string[] = [];
  const addPath = (raw?: string | null) => {
    if (!raw) return;
    const trimmed = raw.trim().replace(/^"|"$/g, '');
    if (!trimmed || trimmed.startsWith('#')) return;
    const path = /^file:/i.test(trimmed) ? fileUrlToLocalPath(trimmed) : trimmed;
    if (path && (
      isCanvasImageFileName(path)
      || isCanvasVideoFileName(path)
      || isCanvasAudioFileName(path)
      || isCanvasTemplateJsonFileName(path)
    )) paths.push(path);
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
