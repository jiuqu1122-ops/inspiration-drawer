import { describe, expect, it } from 'vitest';
import { getCanvasWebviewBackgroundColor } from './canvasWebviewBackground';

import nativeShape from '../../../src-tauri/src/main_window_shape.rs?raw';
import nativeMain from '../../../src-tauri/src/main.rs?raw';
import shell from '../drawer/components/DrawerShell.tsx?raw';

describe('opaque canvas backplate and rounded native window contract', () => {
  it('matches the original shell corner radius instead of redesigning the layout', () => {
    expect(shell).toContain('borderRadius: 16');
    expect(shell).toContain("clipPath: 'inset(0 round 16px)'");
    expect(nativeShape).toContain('MAIN_WINDOW_CORNER_RADIUS_LOGICAL: f64 = 16.0');
  });

  it('keeps the opaque canvas backplate so the corner repair does not undo anti-flicker', () => {
    expect(getCanvasWebviewBackgroundColor(true, false)[3]).toBe(255);
    expect(getCanvasWebviewBackgroundColor(true, true)[3]).toBe(255);
    expect(getCanvasWebviewBackgroundColor(false, true)[3]).toBe(0);
  });

  it('limits native clipping to main and updates only on bounds or DPI changes', () => {
    expect(nativeMain).toContain('main_window_shape::install(&main)');
    expect(nativeShape).toMatch(/if window\.label\(\) != "main"\s*\{\s*return Ok\(\(\)\);\s*\}/);
    expect(nativeShape).toContain('tauri::WindowEvent::Resized(_)');
    expect(nativeShape).toContain('tauri::WindowEvent::ScaleFactorChanged');
    expect(nativeShape).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|from_millis/);
  });
});
