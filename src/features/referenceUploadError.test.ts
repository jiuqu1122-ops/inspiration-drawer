import { describe, expect, it } from 'vitest';
import {
  formatReferenceUploadError,
  formatReferenceUploadFailureNotice,
  sanitizeReferenceUploadError,
} from './referenceUploadError';

describe('reference upload errors', () => {
  it('preserves structured upload stages', () => {
    expect(formatReferenceUploadError('获取上传凭证失败：TLS 连接失败')).toBe(
      '获取上传凭证失败：TLS 连接失败',
    );
    expect(formatReferenceUploadError('上传图片文件失败：对象存储返回 HTTP 413')).toBe(
      '上传图片文件失败：对象存储返回 HTTP 413',
    );
    expect(formatReferenceUploadError('参考图兼容上传失败：连接被重置')).toBe(
      '参考图兼容上传失败：连接被重置',
    );
  });

  it('summarizes partial multi-image failures with counts and stages', () => {
    const message = formatReferenceUploadFailureNotice([
      '获取上传凭证失败：连接被重置',
      '上传图片文件失败：请求超时',
    ]);
    expect(message).toContain('2 张参考图上传失败：');
    expect(message).toContain('参考图 1：获取上传凭证失败：连接被重置');
    expect(message).toContain('参考图 2：上传图片文件失败：请求超时');
  });

  it('redacts tokens, signed URLs, request bodies, and local paths', () => {
    const message = sanitizeReferenceUploadError(
      'Authorization: Bearer secret-token url=https://oss.example.test/file?X-Amz-Signature=secret-signature '
      + 'path=C:\\Users\\private\\reference.png request body: {"token":"body-secret"}',
    );
    for (const secret of [
      'secret-token',
      'https://',
      'X-Amz-Signature',
      'secret-signature',
      'C:\\Users\\private',
      'body-secret',
    ]) {
      expect(message).not.toContain(secret);
    }
  });
});
