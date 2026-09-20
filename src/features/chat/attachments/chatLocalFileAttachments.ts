import type { PendingChatAttachment } from '../model/chatTypes';
import { createChatId } from '../model/chatTypes';

export const SUPPORTED_CHAT_LOCAL_FILE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif',
  'json', 'workflow', 'canvas',
  'txt', 'doc', 'docx', 'xls', 'xlsx', 'pdf',
] as const;

export type ChatLocalAttachmentType = 'image' | 'workflow' | 'file';

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

const FILE_MIME_TYPES: Record<string, string> = {
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

const getExtension = (path: string) => {
  const fileName = String(path || '').trim().split(/[?#]/, 1)[0].split(/[\\/]/).pop() || '';
  const match = fileName.match(/\.([^.]+)$/);
  return match?.[1]?.toLowerCase() || '';
};

export const getChatLocalFileExtension = getExtension;

export const getChatAttachmentType = (path: string): ChatLocalAttachmentType => {
  const extension = getExtension(path);
  if (extension in IMAGE_MIME_TYPES) return 'image';
  if (['json', 'workflow', 'canvas'].includes(extension)) return 'workflow';
  return 'file';
};

export const getChatAttachmentMimeType = (path: string) => {
  const extension = getExtension(path);
  return IMAGE_MIME_TYPES[extension]
    || (['json', 'workflow', 'canvas'].includes(extension) ? 'application/json' : FILE_MIME_TYPES[extension] || 'application/octet-stream');
};

export const createPendingChatAttachments = (
  paths: string[],
  existing: PendingChatAttachment[] = [],
  maxCount = 6,
): PendingChatAttachment[] => {
  const known = new Set(existing.map(item => item.path));
  const remaining = Math.max(0, maxCount - existing.length);
  return paths
    .map(path => String(path || '').trim())
    .filter(path => {
      if (!path || known.has(path)) return false;
      known.add(path);
      return true;
    })
    .slice(0, remaining)
    .map(path => ({
      id: createChatId('chat-attachment'),
      type: getChatAttachmentType(path),
      path,
      mimeType: getChatAttachmentMimeType(path),
    } satisfies PendingChatAttachment));
};
