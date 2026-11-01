import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const harness = vi.hoisted(() => ({ effects: [] as Array<() => unknown>, invoke: vi.fn(), listen: vi.fn() }));
vi.mock('react', () => ({
  useEffect: (effect: () => unknown) => harness.effects.push(effect),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
}));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: () => Promise.resolve('8.0.27') }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: harness.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: harness.listen }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));
import { isAppUpdateEnabled, useAppUpdate } from './useAppUpdate';
beforeEach(() => {
  harness.effects.length = 0; harness.invoke.mockReset(); harness.listen.mockReset();
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
  vi.stubGlobal('window', { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('local test installer update policy', () => {
  it('keeps ordinary production builds opted into existing update behavior', () => {
    vi.stubEnv('VITE_DISABLE_APP_UPDATES', '');
    expect(isAppUpdateEnabled()).toBe(true);
    const update = useAppUpdate({ isMainDrawerWindow: true, showToast: vi.fn() });
    expect(update.showAppUpdatePromptArrow).toBe(true);
    harness.effects.forEach(effect => effect());
    expect(window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 15000);
  });
  it('does not show prompts or schedule any automatic update in a test installer', () => {
    vi.stubEnv('VITE_DISABLE_APP_UPDATES', 'true');
    expect(isAppUpdateEnabled()).toBe(false);
    const update = useAppUpdate({ isMainDrawerWindow: true, showToast: vi.fn() });
    expect(update.showAppUpdatePromptArrow).toBe(false);
    harness.effects.forEach(effect => effect());
    expect(window.setTimeout).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(harness.invoke).not.toHaveBeenCalled(); expect(harness.listen).not.toHaveBeenCalled();
  });
  it('also blocks the manual UI entry without invoking or listening to the native updater', async () => {
    vi.stubEnv('VITE_DISABLE_APP_UPDATES', 'true');
    const showToast = vi.fn();
    const update = useAppUpdate({ isMainDrawerWindow: true, showToast });
    await update.checkAndInstallAppUpdate();
    expect(showToast).toHaveBeenCalledWith('当前为内部测试包，已关闭在线更新');
    showToast.mockClear();
    await update.checkAndInstallAppUpdate({ silent: true });
    expect(showToast).not.toHaveBeenCalled();
    expect(harness.invoke).not.toHaveBeenCalled(); expect(harness.listen).not.toHaveBeenCalled();
    expect(window.setTimeout).not.toHaveBeenCalled();
  });
});
