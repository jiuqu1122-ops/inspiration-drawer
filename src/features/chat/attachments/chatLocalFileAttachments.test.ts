import { describe, expect, it } from 'vitest';
import {
  createPendingChatAttachments,
  getChatAttachmentMimeType,
  getChatAttachmentType,
  getChatLocalFileExtension,
  SUPPORTED_CHAT_LOCAL_FILE_EXTENSIONS,
} from './chatLocalFileAttachments';
import type { PendingChatAttachment } from '../model/chatTypes';

describe('chat local file attachments', () => {
  it('supports common image, workflow, text, office and PDF extensions', () => {
    expect(SUPPORTED_CHAT_LOCAL_FILE_EXTENSIONS).toEqual(expect.arrayContaining([
      'txt', 'doc', 'docx', 'xls', 'xlsx', 'pdf',
    ]));
    expect(getChatAttachmentType('C:\\notes\\brief.TXT')).toBe('file');
    expect(getChatAttachmentMimeType('/tmp/report.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(getChatAttachmentMimeType('/tmp/budget.XLS')).toBe('application/vnd.ms-excel');
    expect(getChatAttachmentMimeType('/tmp/brief.pdf')).toBe('application/pdf');
    expect(getChatAttachmentType('/tmp/design.png')).toBe('image');
    expect(getChatAttachmentType('/tmp/workflow.canvas')).toBe('workflow');
  });

  it('normalizes extensions and creates bounded, non-duplicated attachments', () => {
    expect(getChatLocalFileExtension('C:\\notes\\brief.TXT?download=1')).toBe('txt');
    const existing: PendingChatAttachment[] = [{ id: 'existing', type: 'file', path: '/tmp/a.txt', mimeType: 'text/plain' }];
    const added = createPendingChatAttachments(['/tmp/a.txt', '/tmp/b.xlsx', '/tmp/b.xlsx', '/tmp/c.pdf'], existing, 3);
    expect(added).toHaveLength(2);
    expect(added.map(item => item.mimeType)).toEqual([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
    ]);
  });
});
