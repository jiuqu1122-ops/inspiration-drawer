import type { ChatAttachment, ChatGeneratedMedia } from '../model/chatTypes';

export const resolveChatReferenceArguments = (input: {
  toolName: string;
  args: Record<string, unknown>;
  currentImageAttachments: ChatAttachment[];
  latestGenerated?: ChatGeneratedMedia;
}) => {
  if (!['generate_image', 'generate_image_variants', 'edit_image'].includes(input.toolName)) {
    return { ...input.args };
  }
  const args = { ...input.args };
  if (args.useAttachedImages === false) return args;
  const explicitReferenceImages = Array.isArray(args.referenceImages)
    ? args.referenceImages.map(String).map(value => value.trim()).filter(Boolean)
    : [];
  const hasUsableReferenceImages = explicitReferenceImages.length > 0;
  const requestedAttachmentIds = Array.isArray(args.attachmentIds)
    ? args.attachmentIds.map(String).map(value => value.trim()).filter(Boolean)
    : [];
  const currentSources = input.currentImageAttachments.map(attachment => attachment.path.trim()).filter(Boolean);

  if (!hasUsableReferenceImages) {
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
    if (!hasUsableReferenceImages) {
      args.referenceImages = [input.latestGenerated.path || input.latestGenerated.url].filter(Boolean);
    }
  }
  return args;
};
