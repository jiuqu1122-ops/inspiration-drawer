import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getVersion: vi.fn(), invoke: vi.fn() }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: mocks.getVersion }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
import { readRhinoPluginSyncResult, RHINO_PLUGIN_SYNC_VERSION_KEY, syncRhinoPluginsAfterClientUpdate } from './rhinoPluginAutoUpdate';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  mocks.getVersion.mockReset().mockResolvedValue('8.0.35');
  mocks.invoke.mockReset();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('post-client-update Rhino plugin sync', () => {
  it('updates already-managed stale plugins and reports restart without installing for fresh users', async () => {
    mocks.invoke.mockResolvedValue({ updatedVersions: [8], skippedDisabledVersions: [], restartRequired: true });
    const result = await syncRhinoPluginsAfterClientUpdate();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('auto_update_managed_rhino_plugins');
    expect(result?.status).toBe('updated');
    expect(result?.message).toContain('Rhino 8');
    expect(result?.message).toContain('重启 Rhino');
    expect(storage.get(RHINO_PLUGIN_SYNC_VERSION_KEY)).toBe('8.0.35');
    expect(readRhinoPluginSyncResult()).toEqual(result);
  });

  it('does not invoke the native installer again for the same desktop version', async () => {
    storage.set(RHINO_PLUGIN_SYNC_VERSION_KEY, '8.0.35');
    expect(await syncRhinoPluginsAfterClientUpdate()).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('does not mark a failed update current so a later launch can retry', async () => {
    mocks.invoke.mockRejectedValue(new Error('Rhino 8 registration denied'));
    const result = await syncRhinoPluginsAfterClientUpdate();
    expect(result?.status).toBe('error');
    expect(result?.message).toContain('Rhino 8 registration denied');
    expect(storage.has(RHINO_PLUGIN_SYNC_VERSION_KEY)).toBe(false);
  });
});
