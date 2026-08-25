import type { BufferItem } from '../../types';

export type MediaDimensions = { width: number; height: number };

export type DrawerMasonryPosition = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type DrawerMasonryLayout = {
  height: number;
  positions: DrawerMasonryPosition[];
};

const normalizeDimension = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
};

export const normalizeMediaDimensions = (
  value?: Partial<MediaDimensions> | null,
): MediaDimensions | null => {
  const width = normalizeDimension(value?.width);
  const height = normalizeDimension(value?.height);
  return width > 0 && height > 0 ? { width, height } : null;
};

export const getItemMediaDimensions = (
  item: Pick<BufferItem, 'width' | 'height'>,
  resolved?: MediaDimensions | null,
) => normalizeMediaDimensions(item) || normalizeMediaDimensions(resolved);

export const getMediaAspectRatio = (
  item: Pick<BufferItem, 'width' | 'height'>,
  resolved?: MediaDimensions | null,
) => {
  const dimensions = getItemMediaDimensions(item, resolved);
  return dimensions ? dimensions.width / dimensions.height : null;
};

export const getMediaDisplayHeight = (
  item: Pick<BufferItem, 'width' | 'height'>,
  columnWidth: number,
  fallbackHeight: number,
  resolved?: MediaDimensions | null,
) => {
  const ratio = getMediaAspectRatio(item, resolved);
  return ratio
    ? Math.max(1, columnWidth) / ratio
    : Math.max(1, fallbackHeight);
};

export const buildDrawerMasonryLayout = (
  items: BufferItem[],
  options: {
    columnCount: number;
    columnWidth: number;
    gap: number;
    fallbackMediaHeight: number;
    resolvedMediaDimensions?: Record<string, MediaDimensions>;
    measuredCardHeights?: Record<string, number>;
  },
): DrawerMasonryLayout => {
  const columnCount = Math.max(1, Math.floor(options.columnCount));
  const columnWidth = Math.max(1, options.columnWidth);
  const gap = Math.max(0, options.gap);
  const columnHeights = new Array<number>(columnCount).fill(0);
  const positions = items.map((item) => {
    let column = 0;
    for (let index = 1; index < columnCount; index += 1) {
      if (columnHeights[index] < columnHeights[column]) column = index;
    }
    const measuredHeight = Number(options.measuredCardHeights?.[item.id]);
    const estimatedHeight = item.type === 'image' || item.type === 'video'
      ? getMediaDisplayHeight(
        item,
        columnWidth,
        options.fallbackMediaHeight,
        options.resolvedMediaDimensions?.[item.id],
      ) + 38
      : options.fallbackMediaHeight + 118;
    const height = Number.isFinite(measuredHeight) && measuredHeight > 0
      ? measuredHeight
      : Math.max(1, estimatedHeight);
    const position = {
      left: column * (columnWidth + gap),
      top: columnHeights[column],
      width: columnWidth,
      height,
    };
    columnHeights[column] += height + gap;
    return position;
  });
  return {
    positions,
    height: Math.max(0, ...columnHeights) > 0
      ? Math.max(0, ...columnHeights) - gap
      : 0,
  };
};
