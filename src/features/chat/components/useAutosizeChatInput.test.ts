import { afterEach, describe, expect, it, vi } from 'vitest';
import { resizeChatInput } from './useAutosizeChatInput';
afterEach(() => vi.unstubAllGlobals());
describe('Chat composer auto height', () => {
  const input = (scrollHeight: number) => {
    vi.stubGlobal('getComputedStyle', () => ({ minHeight: '46px', maxHeight: '320px', borderTopWidth: '0px', borderBottomWidth: '0px' }));
    return { scrollHeight, scrollTop: 25, style: {} } as HTMLTextAreaElement;
  };
  it('grows with wrapped/pasted text and shrinks after clearing the draft', () => {
    const area = input(210);
    resizeChatInput(area); expect(area.style.height).toBe('210px'); expect(area.style.overflowY).toBe('hidden');
    Object.assign(area, { scrollHeight: 20 }); resizeChatInput(area); expect(area.style.height).toBe('46px');
  });
  it('caps very long drafts and retains their scroll position', () => {
    const area = input(1500); resizeChatInput(area);
    expect(area.style.height).toBe('320px'); expect(area.style.overflowY).toBe('auto'); expect(area.scrollTop).toBe(25);
  });
});
