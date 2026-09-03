import { describe, expect, it } from 'vitest';
import { normalizeVisibleChatText, stripInvisibleChatCharacters } from './chatVisibleText';

describe('visible Chat text', () => {
  it('treats zero-width placeholders as empty output', () => {
    expect(normalizeVisibleChatText('\u200B\u200C\u200D\u2060\uFEFF\n')).toBe('');
  });

  it('preserves visible markdown while removing invisible placeholders', () => {
    expect(normalizeVisibleChatText('\u200B  **需求分析**\n\n- 保持主体  \uFEFF'))
      .toBe('**需求分析**\n\n- 保持主体');
  });

  it('does not trim streamed text when only stripping invisible characters', () => {
    expect(stripInvisibleChatCharacters('  第一段\u200B\n')).toBe('  第一段\n');
  });
});
