import { describe, expect, it } from 'vitest';
import { CANVAS_CHAT_TOP_VAR, syncCanvasChatTop } from './syncCanvasChatTop';

describe('syncCanvasChatTop', () => {
  it('publishes the chrome height so canvas chat can sit below settings', () => {
    const stored = new Map<string, string>();
    const main = {
      style: {
        setProperty(name: string, value: string) {
          stored.set(name, value);
        },
      },
    } as unknown as HTMLElement;
    const chrome = {
      getBoundingClientRect: () => ({ height: 188.4 }),
    } as HTMLElement;

    syncCanvasChatTop(main, chrome);
    expect(stored.get(CANVAS_CHAT_TOP_VAR)).toBe('188px');
  });
});
