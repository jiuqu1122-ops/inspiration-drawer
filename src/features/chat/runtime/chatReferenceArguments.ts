import type { ChatAttachment, ChatGeneratedMedia } from '../model/chatTypes';

export const resolveChatReferenceArguments = (input: {
  toolName: string;
  args: Record<string, unknown>;
  currentImageAttachments: ChatAttachment[];
  availableImageAttachments?: ChatAttachment[];
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
  if (explicitReferenceImages.length) return args;
  const requestedAttachmentIds = Array.isArray(args.attachmentIds)
    ? args.attachmentIds.map(String).map(value => value.trim()).filter(Boolean)
    : [];
  const maskAttachmentId = String(args.maskAttachmentId || '').trim();
  const isReference = (attachment: ChatAttachment) => {
    if (attachment.id === maskAttachmentId) return false;
    try { return JSON.parse(attachment.metadataJson || '{}').role !== 'mask'; } catch { return true; }
  };
  const available = input.availableImageAttachments ?? input.currentImageAttachments;
  const sourceId = String(args.sourceImageId || '').trim();
  const selectedIds = requestedAttachmentIds.length ? requestedAttachmentIds : sourceId ? [sourceId] : [];
  if (selectedIds.length) {
    const byId = new Map(available.map(image => [image.id, image]));
    args.referenceImages = [...new Set(selectedIds)].flatMap(id => {
      const attachment = byId.get(id);
      if (attachment) return isReference(attachment) ? [attachment.path] : [];
      const generated = input.latestGenerated;
      if (generated?.type === 'image' && (generated.id === id || generated.assetId === id)) {
        return [generated.path || generated.url].filter(Boolean);
      }
      throw new Error('指定的图片不在本轮可用的对话图片中，请重新选择要处理的图片。');
    });
    if (!(args.referenceImages as string[]).length) throw new Error('请选择一张源图，蒙版需单独指定。');
    return args;
  }
  const currentSources = input.currentImageAttachments.filter(isReference).map(attachment => attachment.path);
  if (currentSources.length) {
    args.referenceImages = currentSources;
  } else if (input.toolName === 'edit_image' && input.latestGenerated?.type === 'image') {
    args.sourceImageId = input.latestGenerated.id;
    args.referenceImages = [input.latestGenerated.path || input.latestGenerated.url].filter(Boolean);
  }
  return args;
};
