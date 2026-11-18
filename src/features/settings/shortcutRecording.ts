type ShortcutKey = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'isComposing' | 'repeat'>;
export const recordedShortcut = (event: ShortcutKey): string | null => {
  if (event.isComposing || event.repeat || ['Control', 'Alt', 'Shift', 'Meta', 'Process', 'Dead', 'Unidentified', 'Escape'].includes(event.key)) return null;
  const aliases: Record<string, string> = { Space: 'Space', Backquote: 'Backquote', Minus: 'Minus', Equal: 'Equal', BracketLeft: 'BracketLeft', BracketRight: 'BracketRight', Backslash: 'Backslash', Semicolon: 'Semicolon', Quote: 'Quote', Comma: 'Comma', Period: 'Period', Slash: 'Slash' };
  const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3) : /^Digit[0-9]$/.test(event.code) ? event.code.slice(5)
    : aliases[event.code] || ({ ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' } as Record<string, string>)[event.key] || event.key;
  if (!event.ctrlKey && !event.altKey && !event.metaKey && !/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key)) throw new Error('请使用 Ctrl、Alt 或 Win 组合键，或 F1–F24 功能键');
  return [...(event.ctrlKey ? ['Ctrl'] : []), ...(event.altKey ? ['Alt'] : []), ...(event.shiftKey ? ['Shift'] : []), ...(event.metaKey ? ['Super'] : []), key.length === 1 ? key.toUpperCase() : key].join('+');
};

// React effect cleanup is async at the native boundary. Serialize ownership
// transitions so an old cleanup cannot unregister the new shortcut lease.
let shortcutTransition: Promise<unknown> = Promise.resolve();
export const queueShortcutTransition = (operation: () => Promise<unknown>) => {
  const current = shortcutTransition.then(operation);
  shortcutTransition = current.catch(() => {});
  return current;
};
