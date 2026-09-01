export type ChatImageGenerationSettings = {
  imageModel?: string;
  imageAspectRatio?: string;
  imageResolution?: string;
};

export const applyChatImageGenerationSettings = (
  args: Record<string, unknown>,
  settings: ChatImageGenerationSettings,
) => {
  const model = settings.imageModel?.trim();
  const aspectRatio = settings.imageAspectRatio?.trim();
  const resolution = settings.imageResolution?.trim();
  return {
    ...args,
    ...(model ? { model } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(resolution ? { resolution } : {}),
  };
};
