import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasDocumentTextSelection, isCanvasClipboardTarget, shouldPreserveNativeTextCopy } from './clipboardShortcutRouting';

class FakeElement {
  constructor(public scope: 'canvas' | 'chat' | 'editor' | 'outside' = 'canvas') {}
  closest(selector: string) {
    if (selector.includes('input')) return this.scope === 'editor' ? this : null;
    return this.scope === 'chat' ? this : null;
  }
}
const event = (target: FakeElement) => ({ target, defaultPrevented: false, isComposing: false } as unknown as KeyboardEvent);
const setup = (selected = '') => {
  vi.stubGlobal('Element', FakeElement);
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('window', { getSelection: () => ({ isCollapsed: !selected, rangeCount: selected ? 1 : 0, toString: () => selected }) });
};
afterEach(() => vi.unstubAllGlobals());
describe('native text copy routing', () => {
  it.each(['Chat design text', 'const x = 1;', '  '])('preserves DOM text selection: %j', text => {
    setup(text);
    expect(hasDocumentTextSelection()).toBe(true);
    expect(shouldPreserveNativeTextCopy(event(new FakeElement()))).toBe(true);
  });
  it('preserves editing even without a selection and when the active editor differs from the target', () => {
    setup();
    expect(shouldPreserveNativeTextCopy(event(new FakeElement('editor')))).toBe(true);
    vi.stubGlobal('document', { activeElement: new FakeElement('editor') });
    expect(shouldPreserveNativeTextCopy(event(new FakeElement()))).toBe(true);
  });
  it('ignores collapsed selection but preserves composition or an already handled event', () => {
    setup();
    const e = event(new FakeElement());
    expect(shouldPreserveNativeTextCopy(e)).toBe(false);
    expect(shouldPreserveNativeTextCopy({ ...e, isComposing: true })).toBe(true);
    expect(shouldPreserveNativeTextCopy({ ...e, defaultPrevented: true })).toBe(true);
  });
  it('excludes nested Chat surfaces and outside panels from canvas clipboard ownership', () => {
    setup();
    const surface = { contains: (node: FakeElement) => node.scope !== 'outside' } as unknown as HTMLElement;
    expect(isCanvasClipboardTarget(new FakeElement() as any, surface)).toBe(true);
    expect(isCanvasClipboardTarget(new FakeElement('chat') as any, surface)).toBe(false);
    expect(isCanvasClipboardTarget(new FakeElement('outside') as any, surface)).toBe(false);
    expect(isCanvasClipboardTarget(null, surface)).toBe(false);
  });
});
