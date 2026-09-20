import type { AgentCanvasSelectionItem } from '../../agentModel';
import type { PendingChatAttachment } from '../model/chatTypes';

export const selectionToChatAttachments = (items: AgentCanvasSelectionItem[]): PendingChatAttachment[] => items
  .flatMap(item => item.references || [])
  .filter(reference => reference.mediaType === 'image' && Boolean(reference.path || reference.source))
  .slice(0, 6)
  .map(reference => ({
    id: `selection-${reference.id}`,
    type: 'image',
    path: reference.path || reference.source || '',
    thumbnailPath: reference.thumbnail,
    mimeType: 'image/jpeg',
    metadataJson: JSON.stringify({ nodeId: reference.nodeId, sourceItemId: reference.sourceItemId }),
  }));

export const getVisibleSelectionChatAttachments = (
  attachments: PendingChatAttachment[],
  workflowCandidateActive: boolean,
  ignoredIds: string[] = [],
) => workflowCandidateActive
  ? []
  : attachments.filter(item => !ignoredIds.includes(item.id));
