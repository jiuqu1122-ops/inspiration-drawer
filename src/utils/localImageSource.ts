import { convertFileSrc } from '@tauri-apps/api/core';

import { fileUrlToLocalPath } from './localMediaPaths';

export type LocalImageSourceConverter = (path: string) => string;

const decodeUrlPath = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return '';
  }
};

export const localPathFromAssetUrl = (value?: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let url: URL;
  try {
    url = new URL(raw);
  } catch (_) {
    return '';
  }

  const isLegacyHttpAsset = /^https?:$/i.test(url.protocol) && url.hostname === 'asset.localhost';
  const isTauriAsset = url.protocol === 'asset:' && (!url.hostname || url.hostname === 'localhost');
  if (!isLegacyHttpAsset && !isTauriAsset) return '';

  const encodedPath = url.pathname || '';
  let path = decodeUrlPath(encodedPath);
  if (!path) return '';

  // convertFileSrc historically emitted /C:/... for Windows drives and may
  // prefix an encoded POSIX root with one additional slash.
  if (/^\/[a-zA-Z]:[\\/]/.test(path) || /^\/\\\\/.test(path)) {
    path = path.slice(1);
  } else if (/^\/%2f/i.test(encodedPath) && path.startsWith('//')) {
    path = path.slice(1);
  }

  return path;
};

export const resolveLocalImageSource = (
  source?: unknown,
  converter: LocalImageSourceConverter = convertFileSrc,
) => {
  const raw = String(source || '').trim();
  if (!raw) return '';

  if (/^(?:data|blob):/i.test(raw)) return raw;

  const assetPath = localPathFromAssetUrl(raw);
  if (assetPath) {
    try {
      return converter(assetPath);
    } catch (_) {
      return raw;
    }
  }

  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^asset:/i.test(raw)) return raw;

  if (/^file:/i.test(raw)) {
    const localPath = fileUrlToLocalPath(raw);
    if (!localPath) return raw;
    try {
      return converter(localPath);
    } catch (_) {
      return raw;
    }
  }

  // Preserve non-file protocols. Everything else is a local path (absolute
  // or relative) and must be exposed through Tauri's asset protocol.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[a-zA-Z]:[\\/]/.test(raw)) return raw;

  try {
    return converter(raw);
  } catch (_) {
    return raw;
  }
};

export const isTemporaryImageSource = (source?: unknown) => (
  /^blob:/i.test(String(source || '').trim())
);

export const shouldShowImageUnavailable = (resolvedSource?: unknown, loadFailed = false) => (
  !String(resolvedSource || '').trim() || loadFailed
);
