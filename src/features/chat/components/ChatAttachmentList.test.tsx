import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCanvasWorkflowSnapshot, createWorkflowAttachment } from '../attachments/chatWorkflowAttachments';
import { ChatAttachmentList } from './ChatAttachmentList';

describe('ChatAttachmentList', () => {
  it('shows the workflow label in compact sent-message attachments', () => {
    const attachment = createWorkflowAttachment(
      createCanvasWorkflowSnapshot([{ id: 'node-1' }], '工业设计效果图工作流（优化版）'),
    );
    const html = renderToStaticMarkup(<ChatAttachmentList attachments={[attachment]} compact />);

    expect(html).toContain('工业设计效果图工作流（优化版）');
    expect(html).toContain('title="工业设计效果图工作流（优化版）"');
  });

  it('uses the local filename for imported file attachments', () => {
    const html = renderToStaticMarkup(<ChatAttachmentList attachments={[{
      id: 'file-1',
      type: 'file',
      path: 'C:\\workflows\\product-review.workflow',
    }]} compact />);

    expect(html).toContain('product-review.workflow');
  });
});
