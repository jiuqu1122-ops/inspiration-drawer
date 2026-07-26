import type { BufferItem } from '../types';

export const getGeneratedImageCacheSource = (item: Partial<BufferItem>) => (
  item.sourceUrl
  || item.originalUrl
  || item.url
  || item.path
  || ''
).trim();

export const isLocalGeneratedImageSource = (value?: string | null) => {
  const source = String(value || '').trim();
  return !!source && (
    /^asset:/i.test(source)
    || /^file:/i.test(source)
    || source.includes('asset.localhost')
    || /^[a-zA-Z]:[\\/]/.test(source)
    || source.startsWith('\\\\')
  );
};

/**
 * A generated image with a local path is already durable. Its remote provenance
 * must not make the drawer download and hash the same image a second time.
 */
export const shouldCacheGeneratedImageAgain = (item: Partial<BufferItem>) => {
  if (String(item.path || '').trim()) return false;
  const source = getGeneratedImageCacheSource(item);
  return !!source && !isLocalGeneratedImageSource(source);
};
