import type { ChatAttachment, ChatGeneratedMedia } from '../model/chatTypes';

export const resolveChatReferenceArguments = (input: {
  toolName: string;
  args: Record<string, unknown>;
  currentImageAttachments: ChatAttachment[];
  latestGenerated?: ChatGeneratedMedia;
}) => {
  if (input.toolName !== 'generate_image' && input.toolName !== 'edit_image') return { ...input.args };
  const args = { ...input.args };
  const hasReferenceImages = Object.prototype.hasOwnProperty.call(args, 'referenceImages');
  const requestedAttachmentIds = Array.isArray(args.attachmentIds)
    ? args.attachmentIds.map(String).map(value => value.trim()).filter(Boolean)
    : [];
  const currentSources = input.currentImageAttachments.map(attachment => attachment.path.trim()).filter(Boolean);

  if (!hasReferenceImages) {
    if (requestedAttachmentIds.length > 0) {
      const selectedIds = new Set(requestedAttachmentIds);
      args.referenceImages = input.currentImageAttachments
        .filter(attachment => selectedIds.has(attachment.id))
        .map(attachment => attachment.path.trim())
        .filter(Boolean);
    } else if (!args.sourceImageId && currentSources.length > 0) {
      args.referenceImages = currentSources;
    }
  }

  if (input.toolName === 'edit_image' && input.latestGenerated && currentSources.length === 0) {
    if (!args.sourceImageId) args.sourceImageId = input.latestGenerated.id;
    if (!hasReferenceImages && !Array.isArray(args.referenceImages)) {
      args.referenceImages = [input.latestGenerated.path || input.latestGenerated.url].filter(Boolean);
    }
  }
  return args;
};
