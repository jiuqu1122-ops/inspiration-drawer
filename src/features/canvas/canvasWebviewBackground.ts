export type CanvasWebviewBackgroundColor = [number, number, number, number];
export interface CanvasWebviewBackgroundTarget {
  setBackgroundColor(color: CanvasWebviewBackgroundColor): Promise<void>;
}

export const getCanvasWebviewBackgroundColor = (canvasMode: boolean, dark: boolean): CanvasWebviewBackgroundColor => {
  if (!canvasMode) return [0, 0, 0, 0];
  return dark ? [36, 36, 36, 255] : [250, 250, 249, 255];
};

/** Keep the OS-visible desktop from bleeding through a transparent canvas WebView
 * when low-memory Windows compositors temporarily drop a large scroll surface. */
export const syncCanvasWebviewBackground = (
  webview: CanvasWebviewBackgroundTarget,
  canvasMode: boolean,
  dark: boolean,
) => webview.setBackgroundColor(getCanvasWebviewBackgroundColor(canvasMode, dark));
