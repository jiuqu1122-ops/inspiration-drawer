import { describe, expect, it } from 'vitest';
import { queueShortcutTransition, recordedShortcut } from './shortcutRecording';
const event = (values: Partial<KeyboardEvent>) => ({ key: 'a', code: 'KeyA', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, isComposing: false, repeat: false, ...values });
describe('shortcut recording', () => {
  it('uses physical keys for shifted and non-English keyboard layouts', () => {
    expect(recordedShortcut(event({ key: 'ф' }))).toBe('Ctrl+A');
    expect(recordedShortcut(event({ key: '!', code: 'Digit1', shiftKey: true }))).toBe('Ctrl+Shift+1');
    expect(recordedShortcut(event({ key: '~', code: 'Backquote', shiftKey: true, ctrlKey: false, altKey: true }))).toBe('Alt+Shift+Backquote');
    expect(recordedShortcut(event({ key: 'F2', code: 'F2', ctrlKey: false }))).toBe('F2');
  });
  it('ignores modifiers, IME composition, held keys and Escape', () => {
    expect(recordedShortcut(event({ key: 'Shift' }))).toBeNull();
    expect(recordedShortcut(event({ isComposing: true }))).toBeNull();
    expect(recordedShortcut(event({ repeat: true }))).toBeNull();
    expect(recordedShortcut(event({ key: 'Escape' }))).toBeNull();
    expect(() => recordedShortcut(event({ ctrlKey: false }))).toThrow('组合键');
  });
  it('finishes old cleanup before registering the next effect lease', async () => {
    const order: string[] = [];
    let finish!: () => void;
    const old = queueShortcutTransition(async () => { order.push('old-start'); await new Promise<void>(resolve => { finish = resolve; }); order.push('old-done'); });
    const cleanup = queueShortcutTransition(async () => { order.push('cleanup'); });
    const next = queueShortcutTransition(async () => { order.push('new-register'); });
    await Promise.resolve(); expect(order).toEqual(['old-start']);
    finish(); await Promise.all([old, cleanup, next]);
    expect(order).toEqual(['old-start', 'old-done', 'cleanup', 'new-register']);
  });
  it('does not poison future shortcut transitions after a registration failure', async () => {
    await expect(queueShortcutTransition(async () => { throw new Error('occupied'); })).rejects.toThrow('occupied');
    await expect(queueShortcutTransition(async () => 'restored')).resolves.toBe('restored');
  });
});
