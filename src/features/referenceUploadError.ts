const REFERENCE_UPLOAD_STAGE_PATTERN = /(?:准备参考图失败|获取上传凭证失败|上传图片文件失败|参考图兼容上传失败|\d+\s*张参考图上传失败)/;

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    if (typeof value.message === 'string') return value.message;
    if (typeof value.error === 'string') return value.error;
  }
  return '';
};

export const sanitizeReferenceUploadError = (error: unknown): string => {
  const sanitized = errorMessage(error)
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [已隐藏]')
    .replace(/\b(?:Authorization|access[_-]?token|token|api[_-]?key|signature)\s*[:=：]\s*(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi, match => `${match.split(/[:=：]/, 1)[0]}：[已隐藏]`)
    .replace(/\b(?:request\s*body|请求体)\s*[:=：][^\r\n]*/gi, '请求体：[已隐藏]')
    .replace(/\b(?:https?|file):\/\/[^\s"'<>]+/gi, '[请求地址已隐藏]')
    .replace(/\b[A-Za-z]:[\\/](?:[^\\/\r\n<>:"|?*]+[\\/])*[^\\/\r\n<>:"|?*\s]*/g, '[本地路径已隐藏]')
    .replace(/\/(?:Users|home|tmp|var\/folders)\/[^\s"'<>]+/g, '[本地路径已隐藏]')
    .trim();
  return sanitized.slice(0, 1_200);
};

export const isReferenceUploadErrorText = (value: string): boolean => (
  REFERENCE_UPLOAD_STAGE_PATTERN.test(value)
);

export const formatReferenceUploadError = (
  error: unknown,
  fallbackStage: 'prepare' | 'upload' = 'upload',
): string => {
  const safe = sanitizeReferenceUploadError(error);
  if (isReferenceUploadErrorText(safe)) return safe;
  const title = fallbackStage === 'prepare' ? '准备参考图失败' : '上传图片文件失败';
  return `${title}：${safe || '未知错误'}`;
};

export const formatReferenceUploadFailureNotice = (errors: unknown[]): string => {
  const messages = errors.map(error => formatReferenceUploadError(error));
  if (messages.length === 0) return '';
  if (messages.length === 1) return messages[0];
  return `${messages.length} 张参考图上传失败：\n${messages
    .map((message, index) => `- 参考图 ${index + 1}：${message}`)
    .join('\n')}`;
};
