import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ effects: [] as Array<() => (() => void)>, load: vi.fn(), check: vi.fn(), sync: vi.fn(), order: [] as string[] }));
vi.mock('react', () => ({ useEffect: (fn: () => (() => void)) => h.effects.push(fn), useRef: (value: unknown) => ({ current: value }) }));
vi.mock('./rhinoRuntime', () => ({ ensureRhinoRuntimeLoaded: h.load }));
vi.mock('./rhinoIndependentUpdates', () => ({ checkRhinoComponentUpdates: h.check, rhinoComponentUpdateMessage: () => 'Restart Rhino' }));
vi.mock('./rhinoPluginAutoUpdate', () => ({ syncRhinoPluginsAfterClientUpdate: h.sync }));
import { useRhinoPluginAutoUpdate } from './useRhinoPluginAutoUpdate';

beforeEach(() => {
  vi.useFakeTimers(); h.effects.length = 0; h.order.length = 0;
  h.load.mockReset().mockImplementation(async () => { h.order.push('load'); });
  h.check.mockReset().mockImplementation(async () => { h.order.push('independent-channel'); return { updated: [], installationError: null }; });
  h.sync.mockReset().mockImplementation(async () => { h.order.push('post-desktop-upgrade-sync'); return null; });
  vi.stubGlobal('window', { setTimeout, clearTimeout });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('independent updates and the existing post-desktop-upgrade sync', () => {
  it('checks the latest independent release before comparing/installing the local plugin', async () => {
    useRhinoPluginAutoUpdate({ isMainDrawerWindow: true, showToast: vi.fn() });
    h.effects[0](); await vi.advanceTimersByTimeAsync(3000);
    expect(h.order).toEqual(['load', 'independent-channel', 'post-desktop-upgrade-sync']);
    expect(h.check).toHaveBeenCalledOnce(); expect(h.sync).toHaveBeenCalledOnce();
  });
  it('still verifies cached/embedded plugins after a desktop upgrade when the channel is offline', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.check.mockRejectedValue(new Error('offline'));
    useRhinoPluginAutoUpdate({ isMainDrawerWindow: true, showToast: vi.fn() });
    h.effects[0](); await vi.advanceTimersByTimeAsync(3000);
    expect(h.sync).toHaveBeenCalledOnce();
  });
  it('checks independent releases even when desktop-version sync has already completed', async () => {
    h.sync.mockResolvedValue(null);
    useRhinoPluginAutoUpdate({ isMainDrawerWindow: true, showToast: vi.fn() });
    h.effects[0](); await vi.advanceTimersByTimeAsync(3000);
    expect(h.check).toHaveBeenCalledOnce();
  });
  it('leaves the post-upgrade marker unset after an installation failure instead of immediately repeating it', async () => {
    h.check.mockResolvedValue({ updated: ['plugin9'], installationError: 'registration denied' });
    useRhinoPluginAutoUpdate({ isMainDrawerWindow: true, showToast: vi.fn() });
    h.effects[0](); await vi.advanceTimersByTimeAsync(3000);
    expect(h.sync).not.toHaveBeenCalled();
  });
  it('does not start an updater from auxiliary windows or after unmount', async () => {
    useRhinoPluginAutoUpdate({ isMainDrawerWindow: false, showToast: vi.fn() });
    h.effects[0](); await vi.advanceTimersByTimeAsync(3000);
    expect(h.check).not.toHaveBeenCalled();
    useRhinoPluginAutoUpdate({ isMainDrawerWindow: true, showToast: vi.fn() });
    h.effects[1]()(); await vi.advanceTimersByTimeAsync(3000);
    expect(h.check).not.toHaveBeenCalled();
  });
});
