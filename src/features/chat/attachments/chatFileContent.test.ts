import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { decodeChatText, excerptChatFileText, extractChatFileContent } from './chatFileContent';

describe('Chat file content', () => {
  it('decodes Chinese Markdown and refuses arbitrary binary data', async () => {
    const bytes = new Uint8Array([0xb2, 0xe2, 0xca, 0xd4]);
    expect((await extractChatFileContent(bytes, '设计.md')).text).toBe('测试');
    expect(decodeChatText(new Uint8Array([0xff, 0xfe, 65, 0]))).toBe('A');
    expect(() => decodeChatText(new Uint8Array([0x50, 0x4b, 0, 0]))).toThrow('受支持的文档格式');
  });

  it.each(['xls', 'xlsx', 'ods'] as const)('extracts cell values and names from a real %s file', async bookType => {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([['型号', '数量'], ['主抽屉', 68]]), '设计');
    const file = new Uint8Array(write(workbook, { type: 'array', bookType }));
    const result = await extractChatFileContent(file, `编排.${bookType}`);
    expect(result.text).toBe('[工作表 设计]\n型号\t数量\n主抽屉\t68');
  });

  it('puts content near the requested identifier into the context budget', () => {
    const text = 'x'.repeat(15_000) + ' 项目编号 UNIT-38612 ' + 'y'.repeat(15_000);
    const excerpt = excerptChatFileText(text, 4_000, 'UNIT-38612');
    expect(excerpt).toContain('项目编号 UNIT-38612');
    expect(excerpt).toHaveLength(4_000);
  });
});
