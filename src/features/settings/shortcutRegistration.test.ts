import { afterEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ isRegistered: vi.fn(), register: vi.fn(), unregister: vi.fn() }));
vi.mock('@tauri-apps/plugin-global-shortcut', () => native);
import { runDrawerCoreEffect03 } from '../drawer/controllers/drawerCoreEffects';
import { queueShortcutTransition } from './shortcutRecording';
const state = (shortcut: string, shortcutRecording = false) => ({ shortcut, shortcutRecording,
  snipShortcut: '', textShortcut: '', searchShortcut: '', triggerShortcut: '', noteShortcut: '', canvasShortcut: '', showToast: vi.fn(),
} as unknown as Parameters<typeof runDrawerCoreEffect03>[0]);
afterEach(async () => { await queueShortcutTransition(async () => {}); vi.clearAllMocks(); });
describe('actual drawer shortcut effect ownership', () => {
  it('serializes async old cleanup before installing a new key', async () => {
    const installed = new Set<string>();
    native.isRegistered.mockImplementation(async key => installed.has(key));
    native.unregister.mockImplementation(async key => { installed.delete(key); });
    let finish!: () => void;
    native.register.mockImplementationOnce(async key => { await new Promise<void>(resolve => { finish = resolve; }); installed.add(key); })
      .mockImplementation(async key => { installed.add(key); });
    const oldCleanup = runDrawerCoreEffect03(state('Alt+G'));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    oldCleanup?.(); const newCleanup = runDrawerCoreEffect03(state('Alt+H'));
    finish(); await queueShortcutTransition(async () => {});
    expect([...installed]).toEqual(['Alt+H']);
    expect(native.unregister).toHaveBeenCalledExactlyOnceWith('Alt+G');
    newCleanup?.(); await queueShortcutTransition(async () => {});
    expect(installed.size).toBe(0);
  });
  it('does not grab global keys while the user is recording a new shortcut', async () => {
    expect(runDrawerCoreEffect03(state('Alt+G', true))).toBeUndefined();
    await queueShortcutTransition(async () => {}); expect(native.register).not.toHaveBeenCalled();
  });
});
