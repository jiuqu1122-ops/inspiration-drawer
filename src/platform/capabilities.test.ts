import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  isPrimaryModifier,
  loadPlatformCapabilities,
  platformShortcutLabel,
  resetPlatformCapabilitiesForTest,
} from './capabilities';

describe('platform capabilities', () => {
  beforeEach(() => {
    resetPlatformCapabilitiesForTest();
    vi.mocked(invoke).mockReset();
  });

  it('uses Command as the primary modifier and native glyphs on macOS', async () => {
    vi.mocked(invoke).mockResolvedValue({ platform: 'macos' });
    await loadPlatformCapabilities();
    expect(isPrimaryModifier({ ctrlKey: false, metaKey: true })).toBe(true);
    expect(isPrimaryModifier({ ctrlKey: true, metaKey: false })).toBe(false);
    expect(platformShortcutLabel('Ctrl+Shift+S')).toBe('⌘⇧S');
    expect(platformShortcutLabel('Alt + Backspace')).toBe('⌥⌫');
    expect(platformShortcutLabel('搜索 (Ctrl+F)')).toBe('搜索 (⌘F)');
  });

  it('does not change Windows shortcut labels', async () => {
    vi.mocked(invoke).mockResolvedValue({ platform: 'windows' });
    await loadPlatformCapabilities();
    expect(platformShortcutLabel('Ctrl+Shift+S')).toBe('Ctrl+Shift+S');
  });

  it('fails closed when the native capability command is unavailable', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('not in Tauri'));
    const value = await loadPlatformCapabilities();
    expect(value.platform).toBe('unknown');
    expect(value.nativeFileDrag).toBe(false);
    expect(value.autoUpdater).toBe(false);
  });
});
