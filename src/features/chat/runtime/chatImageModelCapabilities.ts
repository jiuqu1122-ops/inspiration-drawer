import type { CloudImageModelsResult } from '../../../types/license';
import { parseCanvasAiModelChoiceValue } from '../../../utils/canvasAiConfig';
import { getCanvasAiAspectRatioOptionsForModel } from '../../../utils/canvasAiAspectRatio';
import { findAiCatalogModel, getAiCatalogModels, getChannelModelCapabilities, resolveImageModelCapabilities } from '../../aiModelCapabilities';
import { getCanvasAiImageResolutionValues, getCanvasAiImageResolutionValuesForCandidates } from '../../canvasAiImage';

/** Same canonical > route > legacy resolution used by canvas generator cards. */
export const resolveChatImageModelCapabilities = (modelValue: string | undefined, snapshot?: CloudImageModelsResult | null) => {
  const config = parseCanvasAiModelChoiceValue(modelValue || '');
  const candidates = config?.providerCandidates || [];
  const candidate = candidates[0];
  const catalog = findAiCatalogModel(getAiCatalogModels(snapshot, 'image'), candidate?.canonicalModelId || config?.model);
  const channelId = candidate?.providerChannelId || config?.providerChannelId;
  const channel = snapshot?.channels?.find(item => item.id === channelId);
  const route = candidate?.modelCapabilities || getChannelModelCapabilities(channel, candidate?.model || config?.model, catalog?.id);
  const resolutions = candidates.length > 0
    ? getCanvasAiImageResolutionValuesForCandidates(candidates)
    : getCanvasAiImageResolutionValues(config?.provider, config?.model, channel?.capabilities);
  return resolveImageModelCapabilities({
    canonical: catalog?.capabilities,
    route,
    legacy: {
      resolutions,
      aspectRatios: getCanvasAiAspectRatioOptionsForModel(config?.model, resolutions[0]).map(item => item.value),
    },
  });
};
