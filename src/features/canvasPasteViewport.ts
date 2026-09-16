export const runCanvasPasteWithViewportPreserved = (
  surfaceRef: { current: HTMLDivElement | null },
  writeScroll: (surface: HTMLDivElement, left: number, top: number) => void,
  append: () => number,
  scheduleFrame: (callback: FrameRequestCallback) => number = callback => window.requestAnimationFrame(callback),
) => {
  const surface = surfaceRef.current;
  const viewport = surface ? { left: surface.scrollLeft, top: surface.scrollTop } : null;
  const addedCount = append();
  if (addedCount <= 0 || !surface || !viewport) return addedCount;

  const restoreViewport = () => {
    if (surfaceRef.current === surface) {
      writeScroll(surface, viewport.left, viewport.top);
    }
  };
  restoreViewport();
  scheduleFrame(restoreViewport);
  return addedCount;
};
