import type { CanvasItemBox } from './canvasModel';

export type CanvasViewportBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CanvasViewportTarget = CanvasItemBox & {
  id: string;
};

const rectanglesOverlap = (left: CanvasViewportBox, right: CanvasViewportBox) => (
  left.x < right.x + right.width
  && left.x + left.width > right.x
  && left.y < right.y + right.height
  && left.y + left.height > right.y
);

const getRectangleGapSquared = (item: CanvasViewportBox, viewport: CanvasViewportBox) => {
  const itemRight = item.x + item.width;
  const itemBottom = item.y + item.height;
  const viewportRight = viewport.x + viewport.width;
  const viewportBottom = viewport.y + viewport.height;
  const gapX = itemRight < viewport.x
    ? viewport.x - itemRight
    : item.x > viewportRight
      ? item.x - viewportRight
      : 0;
  const gapY = itemBottom < viewport.y
    ? viewport.y - itemBottom
    : item.y > viewportBottom
      ? item.y - viewportBottom
      : 0;
  return gapX * gapX + gapY * gapY;
};

const getCenterDistanceSquared = (item: CanvasViewportBox, viewport: CanvasViewportBox) => {
  const dx = item.x + item.width / 2 - (viewport.x + viewport.width / 2);
  const dy = item.y + item.height / 2 - (viewport.y + viewport.height / 2);
  return dx * dx + dy * dy;
};

/**
 * Returns no target when the current viewport already contains canvas content.
 * Otherwise, picks the item whose rectangle is closest to the viewport, using
 * center distance only as a deterministic tie-breaker.
 */
export const findNearestCanvasItemIdForEmptyViewport = (
  items: CanvasViewportTarget[],
  viewport: CanvasViewportBox | null,
) => {
  if (!viewport || items.length === 0) return null;
  if (items.some(item => rectanglesOverlap(item, viewport))) return null;

  let nearest: CanvasViewportTarget | null = null;
  let nearestGap = Number.POSITIVE_INFINITY;
  let nearestCenterDistance = Number.POSITIVE_INFINITY;

  for (const item of items) {
    const gap = getRectangleGapSquared(item, viewport);
    const centerDistance = getCenterDistanceSquared(item, viewport);
    if (gap < nearestGap || (gap === nearestGap && centerDistance < nearestCenterDistance)) {
      nearest = item;
      nearestGap = gap;
      nearestCenterDistance = centerDistance;
    }
  }

  return nearest?.id || null;
};
