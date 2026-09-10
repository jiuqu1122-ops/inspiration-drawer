export type CanvasWheelIntent = 'pan' | 'zoom';

const MACOS_PINCH_ZOOM_MULTIPLIER = 4;

export const resolveCanvasWheelIntent = (
  isMacOS: boolean,
  event: Pick<WheelEvent, 'ctrlKey'>,
): CanvasWheelIntent => (
  isMacOS && !event.ctrlKey ? 'pan' : 'zoom'
);

export const amplifyCanvasWheelZoomDelta = (deltaY: number, isMacOS: boolean) => (
  deltaY * (isMacOS ? MACOS_PINCH_ZOOM_MULTIPLIER : 1)
);
