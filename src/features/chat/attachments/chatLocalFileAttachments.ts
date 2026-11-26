import type { PendingChatAttachment } from '../model/chatTypes';
import { createChatId } from '../model/chatTypes';

export const SUPPORTED_CHAT_LOCAL_FILE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif',
  'json', 'workflow', 'canvas', 'txt', 'md', 'markdown', 'csv', 'tsv', 'pdf',
  'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'xlsb', 'pptx', 'odt', 'ods', 'odp',
  'log', 'xml', 'yaml', 'yml', 'toml', 'ini', 'html', 'htm', 'svg', 'css',
  'js', 'jsx', 'ts', 'tsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'cs',
  'rb', 'php', 'sh', 'ps1', 'sql', 'jsonl', 'ipynb', 'rtf',
] as const;

export const MAX_CHAT_LOCAL_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENTS = 6;
export const CHAT_LOCAL_PATH_DROP_EVENT = 'inspiration-chat-local-path-drop';
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
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
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
  if (extension === 'workflow' || extension === 'canvas') return 'workflow';
  return 'file';
};

export const getChatAttachmentMimeType = (path: string) => {
  const extension = getExtension(path);
  return IMAGE_MIME_TYPES[extension]
    || (extension === 'workflow' || extension === 'canvas' ? 'application/json' : FILE_MIME_TYPES[extension] || 'application/octet-stream');
};

export const chatLocalAttachmentName = (attachment: Pick<PendingChatAttachment, 'path' | 'metadataJson'>) => {
  try {
    const metadata = JSON.parse(attachment.metadataJson || '{}');
    if (typeof metadata?.fileName === 'string' && metadata.fileName.trim()) return metadata.fileName;
  } catch { /* Older attachments have no file name metadata. */ }
  return attachment.path.split(/[\\/]/).pop() || '附件';
};

export const assertChatLocalFileSize = (size: number, name: string) => {
  if (size > MAX_CHAT_LOCAL_FILE_BYTES) throw new Error(`“${name}”超过 30 MB，请拆分后再添加。`);
};

export const createDroppedChatAttachment = (file: File): PendingChatAttachment => {
  assertChatLocalFileSize(file.size, file.name);
  const id = createChatId('chat-attachment');
  return {
    id,
    type: getChatAttachmentType(file.name),
    path: `chat-drop://${id}`,
    mimeType: getChatAttachmentMimeType(file.name),
    metadataJson: JSON.stringify({ fileName: file.name }),
    droppedFile: file,
  };
};

export function routeChatLocalPathDrop(paths: string[], point?: { x: number; y: number }): boolean {
  if (!paths.length || !point || typeof document === 'undefined' || !document.elementFromPoint) return false;
  const composer = document.elementFromPoint(point.x, point.y)?.closest('[data-chat-file-drop]');
  if (!composer || composer.closest('[aria-hidden="true"]')) return false;
  return !composer.dispatchEvent(new CustomEvent(CHAT_LOCAL_PATH_DROP_EVENT, { detail: paths, cancelable: true }));
}

export const createPendingChatAttachments = (
  paths: string[],
  existing: PendingChatAttachment[] = [],
  maxCount = MAX_CHAT_ATTACHMENTS,
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
