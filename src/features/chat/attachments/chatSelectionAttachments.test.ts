import { describe, expect, it } from 'vitest';
import type { AgentCanvasSelectionItem } from '../../agentModel';
import { getVisibleSelectionChatAttachments, selectionToChatAttachments } from './chatSelectionAttachments';

describe('chat selection attachments', () => {
  const selected: AgentCanvasSelectionItem[] = [{
    id: 'workflow-node',
    name: '产品工作流',
    type: 'workflow',
    references: [{
      id: 'reference-1',
      nodeId: 'workflow-node',
      name: '输入图',
      mediaType: 'image',
      path: 'C:\\input.png',
    }],
  }];

  it('does not expose selected node images while workflow candidate mode is active', () => {
    const attachments = selectionToChatAttachments(selected);
    expect(attachments).toHaveLength(1);
    expect(getVisibleSelectionChatAttachments(attachments, true)).toEqual([]);
    expect(getVisibleSelectionChatAttachments(attachments, false)).toEqual(attachments);
  });
});
