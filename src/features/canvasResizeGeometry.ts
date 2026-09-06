import type { CanvasItemBox } from './canvasModel';

export type CanvasDesignSize = {
  width: number;
  height: number;
};

export const getCanvasDesignScale = (
  box: Pick<CanvasItemBox, 'width' | 'height'>,
  designSize: CanvasDesignSize,
) => {
  if (
    !Number.isFinite(box.width)
    || !Number.isFinite(box.height)
    || !Number.isFinite(designSize.width)
    || !Number.isFinite(designSize.height)
    || box.width <= 0
    || box.height <= 0
    || designSize.width <= 0
    || designSize.height <= 0
  ) {
    return 1;
  }
  return Math.max(
    0.1,
    Math.min(box.width / designSize.width, box.height / designSize.height),
  );
};

export const fitCanvasBoxToDesign = (
  box: CanvasItemBox,
  designSize: CanvasDesignSize,
): CanvasItemBox => {
  const scale = getCanvasDesignScale(box, designSize);
  return {
    x: box.x,
    y: box.y,
    width: designSize.width * scale,
    height: designSize.height * scale,
  };
};

export const getCanvasBoxesBounds = (
  boxes: CanvasItemBox[],
): CanvasItemBox | null => {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map(box => box.x));
  const top = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width));
  const bottom = Math.max(...boxes.map(box => box.y + box.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
};

export const rotateCanvasBoxQuarterTurn = (
  box: CanvasItemBox,
): CanvasItemBox => {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  return {
    x: centerX - box.height / 2,
    y: centerY - box.width / 2,
    width: box.height,
    height: box.width,
  };
};
