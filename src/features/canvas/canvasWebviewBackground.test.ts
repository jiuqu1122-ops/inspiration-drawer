import { describe, expect, it, vi } from 'vitest';
import { getCanvasWebviewBackgroundColor, syncCanvasWebviewBackground } from './canvasWebviewBackground';

describe('canvas WebView compositor backplate', () => {
  it('uses opaque canvas-matched colors and restores transparent drawer mode', () => {
    expect(getCanvasWebviewBackgroundColor(true, false)).toEqual([250, 250, 249, 255]);
    expect(getCanvasWebviewBackgroundColor(true, true)).toEqual([36, 36, 36, 255]);
    expect(getCanvasWebviewBackgroundColor(false, false)).toEqual([0, 0, 0, 0]);
    expect(getCanvasWebviewBackgroundColor(false, true)).toEqual([0, 0, 0, 0]);
  });
  it('forwards the transition to the active WebView', async () => {
    const setBackgroundColor = vi.fn(async () => {});
    await syncCanvasWebviewBackground({ setBackgroundColor }, true, true);
    expect(setBackgroundColor).toHaveBeenCalledOnce();
    expect(setBackgroundColor).toHaveBeenCalledWith([36, 36, 36, 255]);
  });
});
