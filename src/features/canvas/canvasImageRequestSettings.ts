import {
  getImageAspectRatioOptionsForResolution,
  normalizeCapabilityOption,
  normalizeImageAspectRatioOption,
  type ResolvedImageModelCapabilities,
} from '../aiModelCapabilities';
import {
  getCanvasAiImageResolutionValuesForCandidates,
  getCanvasAiPublicImageModelName,
  normalizeCanvasAiImageResolutionForCandidates,
  normalizeCanvasAiImageResolutionForModel,
  supportsCanvasAiImageResolution,
} from '../canvasAiImage';
import type { CanvasAiCredentialSource,CanvasAiModelCandidate,CanvasAiProvider } from '../canvasModel';
import { CANVAS_AI_DEFAULT_ASPECT_RATIO,normalizeCanvasAiAspectRatioForModel } from '../../utils/canvasAiAspectRatio';
import { CANVAS_AI_DEFAULT_IMAGE_RESOLUTION } from '../../utils/canvasAiConfig';

export type CanvasImageModelChoice = {
  source: CanvasAiCredentialSource;
  provider: CanvasAiProvider;
  model: string;
  providerChannelId?: string;
  providerCandidates?: CanvasAiModelCandidate[];
};

export const findCanvasImageModelChoice = (
  choices: readonly CanvasImageModelChoice[],
  identity: {
    canonicalModelId?: string | null;
    provider: CanvasAiProvider;
    model?: string | null;
    providerChannelId?: string | null;
    publicModel?: string | null;
  },
) => {
  const canonicalModelId = String(identity.canonicalModelId || '').trim();
  const model = String(identity.model || '').trim();
  const providerChannelId = String(identity.providerChannelId || '').trim();
  const canonicalMatch = canonicalModelId
    ? choices.find(choice => (
      choice.model === canonicalModelId
      || choice.providerCandidates?.some(candidate => candidate.canonicalModelId === canonicalModelId)
    ))
    : undefined;
  if (canonicalMatch) return canonicalMatch;

  const routeMatch = model
    ? choices.find(choice => (
      (choice.provider === identity.provider
        && choice.model === model
        && (!providerChannelId || choice.providerChannelId === providerChannelId))
      || choice.providerCandidates?.some(candidate => (
        candidate.provider === identity.provider
        && candidate.model === model
        && (!providerChannelId || candidate.providerChannelId === providerChannelId)
      ))
    ))
    : undefined;
  if (routeMatch) return routeMatch;

  const publicModel = String(identity.publicModel || '').trim();
  return publicModel
    ? choices.find(choice => {
      const rawChoicePublicModel = getCanvasAiPublicImageModelName(choice.provider, choice.model);
      const choicePublicModel = rawChoicePublicModel === 'GPT Image 2 H'
        ? 'GPT Image 2'
        : rawChoicePublicModel;
      return choicePublicModel === publicModel;
    })
    : undefined;
};

export const resolveCanvasImageRequestSettings = (options: {
  provider: CanvasAiProvider;
  model?: string | null;
  resolution?: string | null;
  aspectRatio?: string | null;
  capabilities: ResolvedImageModelCapabilities;
  providerCandidates?: readonly CanvasAiModelCandidate[];
  legacyModelCapabilities?: readonly string[] | null;
}) => {
  const candidateResolutionValues = getCanvasAiImageResolutionValuesForCandidates(
    options.providerCandidates,
  );
  const resolution = options.capabilities.source === 'server'
    ? normalizeCapabilityOption(
      options.capabilities.resolutions,
      options.resolution,
      CANVAS_AI_DEFAULT_IMAGE_RESOLUTION,
    )
    : candidateResolutionValues.length > 0
      ? normalizeCanvasAiImageResolutionForCandidates(
        options.providerCandidates || [],
        options.resolution,
      )
      : supportsCanvasAiImageResolution(
        options.provider,
        options.model,
        options.legacyModelCapabilities,
      )
        ? normalizeCanvasAiImageResolutionForModel(
          options.provider,
          options.model,
          options.resolution,
          options.legacyModelCapabilities,
        )
        : options.resolution || undefined;
  const allowedAspectRatios = getImageAspectRatioOptionsForResolution(
    options.capabilities,
    resolution,
  );
  const aspectRatio = allowedAspectRatios.length > 0
    ? normalizeImageAspectRatioOption(
      allowedAspectRatios,
      options.aspectRatio,
      CANVAS_AI_DEFAULT_ASPECT_RATIO,
    )
    : normalizeCanvasAiAspectRatioForModel(
      options.model,
      options.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
      resolution,
    );

  return { resolution, aspectRatio };
};
