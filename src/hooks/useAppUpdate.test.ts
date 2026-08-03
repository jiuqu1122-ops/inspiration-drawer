import { describe, expect, it } from 'vitest';

import { formatAppUpdateErrorMessage } from './useAppUpdate';

describe('formatAppUpdateErrorMessage', () => {
  it('preserves specific manifest, signature, checksum, and network diagnostics', () => {
    expect(formatAppUpdateErrorMessage(new Error('manifest 不是合法 JSON: unexpected token')))
      .toContain('manifest 不是合法 JSON');
    expect(formatAppUpdateErrorMessage('signature field was not set'))
      .toContain('signature 必须是 .sig 文件内容');
    expect(formatAppUpdateErrorMessage('SHA256 mismatch'))
      .toContain('sha256 缺失或不匹配');
    expect(formatAppUpdateErrorMessage('connection timed out'))
      .toContain('请求失败');
  });

  it('keeps the original unknown error text', () => {
    expect(formatAppUpdateErrorMessage('unexpected updater failure'))
      .toBe('检查更新失败：unexpected updater failure');
  });
});
