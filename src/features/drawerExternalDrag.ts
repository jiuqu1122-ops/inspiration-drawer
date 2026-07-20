import type { BufferItem } from '../types';

const uniqueSources = (values: Array<string | null | undefined>) => Array.from(new Set(
  values.map(value => String(value || '').trim()).filter(Boolean),
));

export const getDrawerExternalDragLocalCandidates = (item: BufferItem) => uniqueSources([
  item.path,
  item.url,
  item.sourceUrl,
  item.originalUrl,
  item.thumbnail,
  item.content,
]).filter(source => !/^(?:https?:|data:|blob:)/i.test(source));

export const getDrawerExternalDragCacheCandidates = (item: BufferItem) => (
  item.type === 'image'
    ? uniqueSources([
      item.sourceUrl,
      item.originalUrl,
      item.url,
      item.path,
      item.thumbnail,
    ]).filter(source => /^(?:https?:|data:image\/)/i.test(source))
    : []
);
