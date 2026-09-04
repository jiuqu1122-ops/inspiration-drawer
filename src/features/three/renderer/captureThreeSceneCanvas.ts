export const THREE_SCENE_CAPTURE_MAX_EDGE = 4096;

export const getThreeSceneCaptureSize = (
  width: number,
  height: number,
  maxEdge = THREE_SCENE_CAPTURE_MAX_EDGE,
) => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const scale = Math.min(1, maxEdge / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
};

export const captureThreeSceneCanvas = (source: HTMLCanvasElement) => {
  const targetSize = getThreeSceneCaptureSize(source.width, source.height);
  if (targetSize.width === source.width && targetSize.height === source.height) {
    return source.toDataURL('image/png');
  }
  const output = document.createElement('canvas');
  output.width = targetSize.width;
  output.height = targetSize.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('无法创建 3D 截图画布');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, targetSize.width, targetSize.height);
  return output.toDataURL('image/png');
};
