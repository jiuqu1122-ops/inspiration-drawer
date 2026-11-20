import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }));
import { checkRhinoComponentUpdates, rhinoComponentUpdateMessage, type RhinoComponentUpdateResult } from './rhinoIndependentUpdates';
beforeEach(() => h.invoke.mockReset());
const result: RhinoComponentUpdateResult = { updated: [], status: { channel: 'rhino-v1', components: [], canRollback: false }, published: true, pluginRestartRequired: false, desktopRestartRequired: false, installationError: null };

describe('independent Rhino update client', () => {
  it('coalesces concurrent checks and permits a later check without changing the desktop version', async () => {
    let finish!: (value: RhinoComponentUpdateResult) => void;
    h.invoke.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const a = checkRhinoComponentUpdates(); const b = checkRhinoComponentUpdates();
    expect(h.invoke).toHaveBeenCalledExactlyOnceWith('check_rhino_updates');
    finish(result); expect(await a).toEqual(result); expect(await b).toEqual(result);
    h.invoke.mockResolvedValue(result); await checkRhinoComponentUpdates();
    expect(h.invoke).toHaveBeenCalledTimes(2);
  });
  it('allows retry after a failed check and does not claim a failed install succeeded', async () => {
    h.invoke.mockRejectedValueOnce(new Error('signature invalid')).mockResolvedValueOnce(result);
    await expect(checkRhinoComponentUpdates()).rejects.toThrow('signature invalid');
    await expect(checkRhinoComponentUpdates()).resolves.toEqual(result);
    expect(rhinoComponentUpdateMessage({ ...result, updated: ['plugin9'], installationError: 'registry denied' })).toContain('注册未完成');
  });
  it('distinguishes unavailable releases, current components, and restart requirements', () => {
    expect(rhinoComponentUpdateMessage({ ...result, published: false })).toContain('尚未发布');
    expect(rhinoComponentUpdateMessage(result)).toContain('当前可用版本');
    const message = rhinoComponentUpdateMessage({ ...result, updated: ['runtime', 'plugin9'], desktopRestartRequired: true, pluginRestartRequired: true });
    expect(message).toContain('无需重装软件'); expect(message).toContain('重启 Rhino');
  });
});
