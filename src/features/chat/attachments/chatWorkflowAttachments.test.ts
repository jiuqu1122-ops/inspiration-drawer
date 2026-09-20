import { describe, expect, it } from 'vitest';
import {
  createCanvasWorkflowSnapshot,
  createWorkflowAttachment,
  getSelectedWorkflowAttachmentLabel,
  parseWorkflowAttachmentSnapshot,
  workflowSnapshotHash,
} from './chatWorkflowAttachments';

describe('chat workflow attachments', () => {
  it('stores a complete, deterministic structure snapshot instead of only a label', () => {
    const snapshot = createCanvasWorkflowSnapshot([{ id: 'input', ai: { model: 'image-model' } }], 'Draft');
    const attachment = createWorkflowAttachment(snapshot);
    expect(attachment.type).toBe('workflow');
    expect(attachment.path).toMatch(/^workflow:\/\/[0-9a-f]+$/);
    expect(parseWorkflowAttachmentSnapshot(attachment)).toEqual(snapshot);
    expect(workflowSnapshotHash(snapshot)).toBe(workflowSnapshotHash({ ...snapshot, nodes: [...snapshot.nodes] }));
  });

  it('rejects malformed workflow metadata before it reaches tool context', () => {
    expect(parseWorkflowAttachmentSnapshot({
      id: 'bad', type: 'workflow', path: 'workflow://bad', metadataJson: '{"snapshot":{"version":2}}',
    })).toBeNull();
  });

  it('uses the selected workflow node name as the snapshot label', () => {
    expect(getSelectedWorkflowAttachmentLabel([
      { name: '工业设计效果图工作流（优化版）' },
    ])).toBe('工业设计效果图工作流（优化版）');
  });
});
