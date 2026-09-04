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

  it('uses Command as the primary modifier on macOS', async () => {
    vi.mocked(invoke).mockResolvedValue({ platform: 'macos' });
    await loadPlatformCapabilities();
    expect(isPrimaryModifier({ ctrlKey: false, metaKey: true })).toBe(true);
    expect(isPrimaryModifier({ ctrlKey: true, metaKey: false })).toBe(false);
    expect(platformShortcutLabel('Ctrl+Shift+S')).toBe('Command+Shift+S');
  });

  it('fails closed when the native capability command is unavailable', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('not in Tauri'));
    const value = await loadPlatformCapabilities();
    expect(value.platform).toBe('unknown');
    expect(value.nativeFileDrag).toBe(false);
    expect(value.autoUpdater).toBe(false);
  });
});
