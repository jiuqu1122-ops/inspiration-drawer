export type ChatImageGenerationSettings = {
  imageModel?: string;
  imageAspectRatio?: string;
  imageResolution?: string;
};

export const applyChatImageGenerationSettings = (
  args: Record<string, unknown>,
  settings: ChatImageGenerationSettings,
) => {
  const requestedModel = String(args.model || '').trim();
  const requestedAspectRatio = String(args.aspectRatio || '').trim();
  const requestedResolution = String(args.resolution || '').trim();
  const model = requestedModel || settings.imageModel?.trim();
  const aspectRatio = requestedAspectRatio || settings.imageAspectRatio?.trim();
  const resolution = requestedResolution || settings.imageResolution?.trim();
  return {
    ...args,
    ...(model ? { model } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(resolution ? { resolution } : {}),
  };
};
