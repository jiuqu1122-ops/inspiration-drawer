export type CanvasPasteSource = 'system' | 'canvas' | 'none';

export const resolveCanvasPasteSource = (input: {
  systemImageCount: number;
  systemText: string;
  canvasItemCount: number;
  preferCanvasItems?: boolean;
}): CanvasPasteSource => {
  if (input.preferCanvasItems && input.canvasItemCount > 0) return 'canvas';
  if (input.systemImageCount > 0 || input.systemText.trim()) return 'system';
  if (input.canvasItemCount > 0) return 'canvas';
  return 'none';
};
