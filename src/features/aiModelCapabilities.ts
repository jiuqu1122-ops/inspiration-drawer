// MODEL_CATALOG_STABILITY_PATCH_V1
import type {
  AiCatalogModel,
  AiModelCapabilities,
  AiModelModality,
  CloudImageModelsResult,
} from '../types/license';
import type { CanvasImageItem } from './canvasModel';

type CapabilitySource = AiModelCapabilities | null | undefined;

export type ResolvedImageModelCapabilities = {
  source: 'server' | 'legacy';
  resolutions: string[];
  defaultResolution?: string;
  aspectRatios: string[];
  aspectRatiosByResolution: Record<string, string[]>;
  referenceImageLimit: number;
  minReferenceImages: number;
  outputFormats: string[];
  maxOutputs: number;
  supportsReferenceImages: boolean;
  supportsTransparentBackground: boolean;
};

export type ResolvedVideoModelCapabilities = {
  source: 'server' | 'legacy';
  resolutions: string[];
  defaultResolution?: string;
  durations: number[];
  durationMode?: 'list' | 'range' | 'fixed';
  durationRange?: { min: number; max: number; step: number };
  defaultDurationSeconds?: number;
  aspectRatios: string[];
  aspectRatioMode?: 'list' | 'any' | 'unspecified';
  defaultAspectRatio?: string;
  referenceImages: number;
  referenceVideos: number;
  referenceAudios: number;
  minReferenceImages: number;
  minReferenceVideos: number;
  minReferenceAudios: number;
  supportsFirstFrame: boolean;
  supportsLastFrame: boolean;
  supportsFirstLastFrame: boolean;
  supportsTextPrompt: boolean;
  firstLastFrame: boolean;
  inputModes: string[];
  outputFormats: string[];
  maxOutputs: number;
  supportsReferenceImages: boolean;
  supportsReferenceVideo: boolean;
  supportsAudioReference: boolean;
};

const normalizeStrings = (value?: readonly string[] | null) => {
  const seen = new Set<string>();
  return (value || []).flatMap(item => {
    const normalized = String(item || '').trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
};

const normalizeDurations = (value?: readonly number[] | null) => Array.from(new Set(
  (value || [])
    .map(item => Number(item))
    .filter(item => Number.isFinite(item) && item > 0),
));

const normalizeStringArrayMap = (value?: Record<string, string[]> | null) => Object.fromEntries(
  Object.entries(value || {}).flatMap(([key, options]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    const normalizedOptions = normalizeStrings(options);
    return normalizedKey && normalizedOptions.length > 0
      ? [[normalizedKey, normalizedOptions] as const]
      : [];
  }),
);

const normalizeLimit = (value: unknown, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const firstDefined = <T>(
  canonical: T | undefined,
  route: T | undefined,
  legacy: T | undefined,
  fallback: T,
) => canonical !== undefined
  ? canonical
  : route !== undefined
    ? route
    : legacy !== undefined
      ? legacy
      : fallback;

const hasStructuredCapabilities = (...values: CapabilitySource[]) => values.some(value => (
  Boolean(value && Object.keys(value).length > 0)
));

const supportsFirstLastFrameMode = (value?: readonly string[] | null) => (
  value?.some(mode => ['flf', 'first_last_frame', 'first-last-frame'].includes(
    String(mode || '').trim().toLowerCase(),
  ))
);

const supportsTextPromptMode = (value?: readonly string[] | null) => (
  value?.some(mode => String(mode || '').trim().toLowerCase() === 'text')
);

export const normalizeAiModelCapabilities = (
  value?: AiModelCapabilities | null,
): AiModelCapabilities | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const normalized: AiModelCapabilities = {};
  if (value.resolutions !== undefined) normalized.resolutions = normalizeStrings(value.resolutions);
  if (value.defaultResolution !== undefined) normalized.defaultResolution = String(value.defaultResolution).trim();
  if (value.aspectRatios !== undefined) normalized.aspectRatios = normalizeStrings(value.aspectRatios);
  if (['list', 'any', 'unspecified'].includes(String(value.aspectRatioMode))) {
    normalized.aspectRatioMode = value.aspectRatioMode;
  }
  if (value.defaultAspectRatio !== undefined) normalized.defaultAspectRatio = String(value.defaultAspectRatio).trim();
  if (value.aspectRatiosByResolution !== undefined) {
    normalized.aspectRatiosByResolution = normalizeStringArrayMap(value.aspectRatiosByResolution);
  }
  if (value.durations !== undefined) normalized.durations = normalizeDurations(value.durations);
  if (['list', 'range', 'fixed'].includes(String(value.durationMode))) {
    normalized.durationMode = value.durationMode;
  }
  if (value.durationRange && typeof value.durationRange === 'object') {
    const min = Math.floor(Number(value.durationRange.min));
    const max = Math.floor(Number(value.durationRange.max));
    const step = Math.floor(Number(value.durationRange.step ?? 1));
    if (min > 0 && max >= min && step >= 1) normalized.durationRange = { min, max, step };
  }
  if (value.defaultDurationSeconds !== undefined) {
    const duration = Math.floor(Number(value.defaultDurationSeconds));
    if (duration > 0) normalized.defaultDurationSeconds = duration;
  }
  if (value.supportedInputModes !== undefined) normalized.supportedInputModes = normalizeStrings(value.supportedInputModes);
  if (value.supportedOutputFormats !== undefined) normalized.supportedOutputFormats = normalizeStrings(value.supportedOutputFormats);
  const limitKeys: Array<keyof Pick<AiModelCapabilities,
    'maxReferenceImages' | 'maxReferenceVideos' | 'maxReferenceAudios'
    | 'minReferenceImages' | 'minReferenceVideos' | 'minReferenceAudios' | 'maxOutputs'
  >> = ['maxReferenceImages', 'maxReferenceVideos', 'maxReferenceAudios', 'minReferenceImages', 'minReferenceVideos', 'minReferenceAudios', 'maxOutputs'];
  const limitMaximums: Record<(typeof limitKeys)[number], number> = {
    maxReferenceImages: 32,
    maxReferenceVideos: 8,
    maxReferenceAudios: 8,
    minReferenceImages: 32,
    minReferenceVideos: 8,
    minReferenceAudios: 8,
    maxOutputs: 16,
  };
  limitKeys.forEach(key => {
    if (value[key] !== undefined) {
      normalized[key] = Math.min(limitMaximums[key], normalizeLimit(value[key]));
    }
  });
  const booleanKeys: Array<keyof Pick<AiModelCapabilities,
    'supportsReferenceImages' | 'supportsReferenceVideo' | 'supportsReferenceAudio' | 'supportsAudioReference'
    | 'supportsFirstFrame' | 'supportsLastFrame' | 'supportsFirstLastFrame'
    | 'supportsTextPrompt' | 'supportsTransparentBackground'
  >> = [
    'supportsReferenceImages',
    'supportsReferenceVideo',
    'supportsReferenceAudio',
    'supportsAudioReference',
    'supportsFirstFrame',
    'supportsLastFrame',
    'supportsFirstLastFrame',
    'supportsTextPrompt',
    'supportsTransparentBackground',
  ];
  booleanKeys.forEach(key => {
    if (value[key] !== undefined) normalized[key] = value[key] === true;
  });
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

/** Canonical public promises win field-by-field; route data only fills gaps. */
export const mergeAiModelCapabilities = (
  canonical?: AiModelCapabilities | null,
  route?: AiModelCapabilities | null,
): AiModelCapabilities | undefined => {
  const normalizedCanonical = normalizeAiModelCapabilities(canonical);
  const normalizedRoute = normalizeAiModelCapabilities(route);
  const merged = {
    ...(normalizedRoute || {}),
    ...(normalizedCanonical || {}),
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
};

export const normalizeAiCatalogModel = (value: AiCatalogModel): AiCatalogModel | null => {
  const id = String(value?.id || '').trim();
  const displayName = String(value?.displayName || id).trim();
  if (!id || !displayName || !['chat', 'image', 'video'].includes(value?.modality)) return null;
  return {
    id,
    displayName,
    modality: value.modality,
    aliases: normalizeStrings(value.aliases),
    capabilities: normalizeAiModelCapabilities(value.capabilities),
    enabled: value.enabled,
    visible: value.visible,
    isDefault: value.isDefault,
  };
};

const listedModelIds = (snapshot: CloudImageModelsResult, modality: AiModelModality) => {
  if (modality === 'image') {
    return normalizeStrings([
      ...(snapshot.models || []),
      ...(snapshot.channels || []).flatMap(channel => channel.models || []),
    ]);
  }
  if (modality === 'video') {
    return normalizeStrings((snapshot.videoChannels || []).flatMap(channel => channel.models || []));
  }
  return [];
};

/** Returns only enabled, visible public SKUs. Exact aliases remain metadata. */
export const getAiCatalogModels = (
  snapshot: CloudImageModelsResult | null | undefined,
  modality: AiModelModality,
): AiCatalogModel[] => {
  if (!snapshot) return [];
  const explicit = (snapshot.catalog || [])
    .map(normalizeAiCatalogModel)
    .filter((model): model is AiCatalogModel => (
      Boolean(model && model.modality === modality && model.enabled !== false && model.visible !== false)
    ));
  if (Array.isArray(snapshot.catalog)) return explicit;

  // Transitional servers can attach a capability map to the existing model
  // lists before they expose a complete catalog response.
  return listedModelIds(snapshot, modality).flatMap(id => {
    const capabilities = normalizeAiModelCapabilities(snapshot.capabilities?.[id]);
    return capabilities ? [{ id, displayName: id, modality, capabilities }] : [];
  });
};

/** Canonical id and explicit server aliases only. No similarity matching. */
export const findAiCatalogModel = (
  catalog: readonly AiCatalogModel[] | null | undefined,
  modelIdOrAlias?: string | null,
) => {
  const id = String(modelIdOrAlias || '').trim();
  if (!id) return undefined;
  return (catalog || []).find(model => model.id === id || (model.aliases || []).includes(id));
};

export const normalizeCapabilityOption = (
  allowed: readonly string[],
  requested?: string | null,
  preferred?: string | null,
) => {
  const exact = String(requested || '').trim();
  const match = allowed.find(value => value.toLowerCase() === exact.toLowerCase());
  if (match) return match;
  const preferredValue = String(preferred || '').trim();
  return allowed.find(value => value.toLowerCase() === preferredValue.toLowerCase())
    || allowed[0]
    || exact;
};

export const hasServerAiCatalog = (snapshot: CloudImageModelsResult | null | undefined) => (
  Array.isArray(snapshot?.catalog)
);

const parseImageAspectRatioOption = (value?: string | null) => {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)\s*([:x\u00d7])\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[3]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    ratio: width / height,
    isDimension: match[2].toLowerCase() !== ':',
  };
};

/**
 * Normalizes image ratios without treating the first capability entry as the
 * semantic default. Image2 advertises exact dimensions for 2K/4K, so a saved
 * `16:9` must resolve to `2048x1152`/`3840x2160` instead of the first (square)
 * entry. An exact dimension that no longer belongs to a semantic-ratio list is
 * considered stale and falls back to the preferred ratio used by the UI.
 */
export const normalizeImageAspectRatioOption = (
  allowed: readonly string[],
  requested?: string | null,
  preferred?: string | null,
) => {
  const exact = String(requested || '').trim();
  const exactMatch = allowed.find(value => value.toLowerCase() === exact.toLowerCase());
  if (exactMatch) return exactMatch;

  const requestedRatio = parseImageAspectRatioOption(exact);
  const allowedRatios = allowed.map(value => ({ value, parsed: parseImageAspectRatioOption(value) }));
  const hasDimensionOption = allowedRatios.some(option => option.parsed?.isDimension);
  if (requestedRatio && (!requestedRatio.isDimension || hasDimensionOption)) {
    const ratioMatch = allowedRatios.find(option => (
      option.parsed && Math.abs(Math.log(option.parsed.ratio / requestedRatio.ratio)) < 0.01
    ));
    if (ratioMatch) return ratioMatch.value;
  }

  const preferredValue = String(preferred || '').trim();
  const preferredMatch = allowed.find(value => value.toLowerCase() === preferredValue.toLowerCase());
  if (preferredMatch) return preferredMatch;
  const preferredRatio = parseImageAspectRatioOption(preferredValue);
  if (preferredRatio) {
    const ratioMatch = allowedRatios.find(option => (
      option.parsed && Math.abs(Math.log(option.parsed.ratio / preferredRatio.ratio)) < 0.01
    ));
    if (ratioMatch) return ratioMatch.value;
  }
  return allowed[0] || exact;
};

export const normalizeCapabilityDuration = (
  allowed: readonly number[],
  requested?: number | null,
  preferred = 15,
) => {
  if (allowed.length === 0) return Math.max(1, Number(requested) || preferred);
  const target = Number(requested);
  if (allowed.includes(target)) return target;
  return allowed.find(value => value >= (Number.isFinite(target) ? target : preferred))
    || allowed[allowed.length - 1];
};

export const getChannelModelCapabilities = (
  channel: { modelCapabilities?: Record<string, AiModelCapabilities> | null } | null | undefined,
  ...exactModelIds: Array<string | null | undefined>
) => {
  const map = channel?.modelCapabilities;
  if (!map) return undefined;
  for (const modelId of exactModelIds) {
    const id = String(modelId || '').trim();
    if (id && map[id]) return normalizeAiModelCapabilities(map[id]);
  }
  return undefined;
};

export const resolveImageModelCapabilities = (options: {
  canonical?: CapabilitySource;
  route?: CapabilitySource;
  legacy?: CapabilitySource;
}): ResolvedImageModelCapabilities => {
  const canonical = normalizeAiModelCapabilities(options.canonical);
  const route = normalizeAiModelCapabilities(options.route);
  const legacy = normalizeAiModelCapabilities(options.legacy);
  const source = hasStructuredCapabilities(canonical, route) ? 'server' : 'legacy';
  const resolutions = normalizeStrings(firstDefined(canonical?.resolutions, route?.resolutions, legacy?.resolutions, []));
  const aspectRatios = normalizeStrings(firstDefined(canonical?.aspectRatios, route?.aspectRatios, legacy?.aspectRatios, []));
  const aspectRatiosByResolution = normalizeStringArrayMap(firstDefined(
    canonical?.aspectRatiosByResolution,
    route?.aspectRatiosByResolution,
    legacy?.aspectRatiosByResolution,
    {},
  ));
  const referenceImageLimit = normalizeLimit(firstDefined(
    canonical?.maxReferenceImages,
    route?.maxReferenceImages,
    legacy?.maxReferenceImages,
    0,
  ));
  const supportsReferenceImages = firstDefined(
    canonical?.supportsReferenceImages,
    route?.supportsReferenceImages,
    legacy?.supportsReferenceImages,
    referenceImageLimit > 0,
  );
  return {
    source,
    resolutions,
    ...(firstDefined(canonical?.defaultResolution, route?.defaultResolution, legacy?.defaultResolution, undefined)
      ? { defaultResolution: firstDefined(canonical?.defaultResolution, route?.defaultResolution, legacy?.defaultResolution, undefined)! }
      : {}),
    aspectRatios,
    aspectRatiosByResolution,
    referenceImageLimit: supportsReferenceImages ? referenceImageLimit : 0,
    minReferenceImages: normalizeLimit(firstDefined(
      canonical?.minReferenceImages,
      route?.minReferenceImages,
      legacy?.minReferenceImages,
      0,
    )),
    outputFormats: normalizeStrings(firstDefined(
      canonical?.supportedOutputFormats,
      route?.supportedOutputFormats,
      legacy?.supportedOutputFormats,
      ['jpg', 'png'],
    )),
    maxOutputs: Math.max(1, normalizeLimit(firstDefined(
      canonical?.maxOutputs,
      route?.maxOutputs,
      legacy?.maxOutputs,
      4,
    ), 4)),
    supportsReferenceImages,
    supportsTransparentBackground: firstDefined(
      canonical?.supportsTransparentBackground,
      route?.supportsTransparentBackground,
      legacy?.supportsTransparentBackground,
      false,
    ),
  };
};

type VideoDurationCapabilities = Pick<AiModelCapabilities,
  'durations' | 'durationMode' | 'durationRange' | 'defaultDurationSeconds'
>;

export const getVideoDurationOptions = (capabilities: VideoDurationCapabilities) => {
  const mode = capabilities.durationMode ?? (capabilities.durations?.length ? 'list' : undefined);
  if (mode === 'range' && capabilities.durationRange) {
    const min = Math.max(1, Math.floor(capabilities.durationRange.min));
    const max = Math.max(min, Math.floor(capabilities.durationRange.max));
    const step = Math.max(1, Math.floor(capabilities.durationRange.step ?? 1));
    return Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => min + index * step);
  }
  return normalizeDurations(capabilities.durations);
};

export const normalizeVideoDurationSelection = (
  capabilities: VideoDurationCapabilities,
  requested?: number | null,
) => {
  const options = getVideoDurationOptions(capabilities);
  const requestedDuration = Number(requested);
  if (options.includes(requestedDuration)) return requestedDuration;
  const defaultDuration = Number(capabilities.defaultDurationSeconds);
  if (options.includes(defaultDuration)) return defaultDuration;
  return options.length === 1 ? options[0] : undefined;
};

export const resolveEffectiveVideoResolution = (
  capabilities: Pick<AiModelCapabilities, 'resolutions' | 'defaultResolution'>,
  requested?: string | null,
) => {
  const resolutions = normalizeStrings(capabilities.resolutions);
  const selected = String(requested || '').trim();
  const exact = resolutions.find(value => value.toLowerCase() === selected.toLowerCase());
  if (exact) return exact;
  const defaultResolution = String(capabilities.defaultResolution || '').trim();
  const preferred = resolutions.find(value => value.toLowerCase() === defaultResolution.toLowerCase());
  if (preferred) return preferred;
  return resolutions.length === 1 ? resolutions[0] : undefined;
};

/** @deprecated Prefer resolveEffectiveVideoResolution for new call sites. */
export const normalizeVideoResolutionSelection = resolveEffectiveVideoResolution;

export const isValidVideoAspectRatio = (value?: string | null) => (
  /^[1-9]\d{0,4}:[1-9]\d{0,4}$/.test(String(value || '').trim())
);

export const getVideoAspectRatioOptions = (
  capabilities: Pick<AiModelCapabilities, 'aspectRatios' | 'aspectRatioMode' | 'defaultAspectRatio'>,
  current?: string | null,
) => {
  const mode = capabilities.aspectRatioMode ?? (capabilities.aspectRatios?.length ? 'list' : undefined);
  if (mode === 'unspecified') return [];
  if (mode === 'any') {
    return normalizeStrings([
      '1:1', '3:4', '4:3', '9:16', '16:9', '21:9',
      ...(isValidVideoAspectRatio(current) ? [String(current)] : []),
    ]);
  }
  return normalizeStrings(capabilities.aspectRatios);
};

export const normalizeVideoAspectRatioSelection = (
  capabilities: Pick<AiModelCapabilities, 'aspectRatios' | 'aspectRatioMode' | 'defaultAspectRatio'>,
  requested?: string | null,
) => {
  const mode = capabilities.aspectRatioMode ?? (capabilities.aspectRatios?.length ? 'list' : undefined);
  if (mode === 'unspecified') return undefined;
  const value = String(requested || '').trim();
  if (mode === 'any' && isValidVideoAspectRatio(value)) return value;
  const options = getVideoAspectRatioOptions(capabilities, value);
  const exact = options.find(option => option.toLowerCase() === value.toLowerCase());
  if (exact) return exact;
  const preferred = String(capabilities.defaultAspectRatio || '').trim();
  const defaultAspectRatio = options.find(option => option.toLowerCase() === preferred.toLowerCase());
  if (defaultAspectRatio) return defaultAspectRatio;
  return mode === 'list' && options.length === 1 ? options[0] : undefined;
};

export const getImageAspectRatioOptionsForResolution = (
  capabilities: Pick<ResolvedImageModelCapabilities, 'aspectRatios' | 'aspectRatiosByResolution'>,
  resolution?: string | null,
) => {
  const key = String(resolution || '').trim().toLowerCase();
  // 1K is presented as a simple aspect-ratio choice. The server still owns
  // the exact upstream pixel conversion, so exposing its dimension table here
  // only leaks adapter details into the node UI and can persist stale sizes.
  if (key === '1k') return capabilities.aspectRatios;
  return capabilities.aspectRatiosByResolution[key]?.length
    ? capabilities.aspectRatiosByResolution[key]
    : capabilities.aspectRatios;
};

export const resolveVideoModelCapabilities = (options: {
  canonical?: CapabilitySource;
  route?: CapabilitySource;
  legacy?: CapabilitySource;
}): ResolvedVideoModelCapabilities => {
  const canonical = normalizeAiModelCapabilities(options.canonical);
  const route = normalizeAiModelCapabilities(options.route);
  const legacy = normalizeAiModelCapabilities(options.legacy);
  const source = hasStructuredCapabilities(canonical, route) ? 'server' : 'legacy';
  const referenceImages = normalizeLimit(firstDefined(canonical?.maxReferenceImages, route?.maxReferenceImages, legacy?.maxReferenceImages, 0));
  const referenceVideos = normalizeLimit(firstDefined(canonical?.maxReferenceVideos, route?.maxReferenceVideos, legacy?.maxReferenceVideos, 0));
  const referenceAudios = normalizeLimit(firstDefined(canonical?.maxReferenceAudios, route?.maxReferenceAudios, legacy?.maxReferenceAudios, 0));
  const supportsReferenceImages = firstDefined(canonical?.supportsReferenceImages, route?.supportsReferenceImages, legacy?.supportsReferenceImages, referenceImages > 0);
  const supportsReferenceVideo = firstDefined(canonical?.supportsReferenceVideo, route?.supportsReferenceVideo, legacy?.supportsReferenceVideo, referenceVideos > 0);
  const supportsAudioReference = firstDefined(
    canonical?.supportsReferenceAudio ?? canonical?.supportsAudioReference,
    route?.supportsReferenceAudio ?? route?.supportsAudioReference,
    legacy?.supportsReferenceAudio ?? legacy?.supportsAudioReference,
    referenceAudios > 0,
  );
  const supportsFirstFrame = firstDefined(
    canonical?.supportsFirstFrame,
    route?.supportsFirstFrame,
    legacy?.supportsFirstFrame,
    false,
  );
  const supportsLastFrame = firstDefined(
    canonical?.supportsLastFrame,
    route?.supportsLastFrame,
    legacy?.supportsLastFrame,
    false,
  );
  const supportsFirstLastFrame = firstDefined(
    canonical?.supportsFirstLastFrame ?? (canonical?.supportedInputModes !== undefined
      ? supportsFirstLastFrameMode(canonical.supportedInputModes)
      : undefined),
    route?.supportsFirstLastFrame ?? (route?.supportedInputModes !== undefined
      ? supportsFirstLastFrameMode(route.supportedInputModes)
      : undefined),
    legacy?.supportsFirstLastFrame ?? (legacy?.supportedInputModes !== undefined
      ? supportsFirstLastFrameMode(legacy.supportedInputModes)
      : undefined),
    false,
  );
  // These are independent provider contracts: accepting a first frame and a
  // last frame separately does not imply accepting a combined FLF request.
  const firstLastFrame = supportsFirstLastFrame;
  const supportsTextPrompt = firstDefined(
    canonical?.supportsTextPrompt ?? (canonical?.supportedInputModes !== undefined
      ? supportsTextPromptMode(canonical.supportedInputModes)
      : undefined),
    route?.supportsTextPrompt ?? (route?.supportedInputModes !== undefined
      ? supportsTextPromptMode(route.supportedInputModes)
      : undefined),
    legacy?.supportsTextPrompt,
    true,
  );
  const inputModes = normalizeStrings(firstDefined(
    canonical?.supportedInputModes,
    route?.supportedInputModes,
    legacy?.supportedInputModes,
    firstLastFrame ? ['reference', 'first_last_frame'] : ['reference'],
  )).filter(mode => firstLastFrame || !supportsFirstLastFrameMode([mode]));
  const durationMode = firstDefined(canonical?.durationMode, route?.durationMode, legacy?.durationMode, undefined);
  const durationRange = firstDefined(canonical?.durationRange, route?.durationRange, legacy?.durationRange, undefined);
  const durationCapabilities = {
    durations: normalizeDurations(firstDefined(canonical?.durations, route?.durations, legacy?.durations, [])),
    ...(durationMode ? { durationMode } : {}),
    ...(durationRange ? { durationRange } : {}),
    ...(firstDefined(canonical?.defaultDurationSeconds, route?.defaultDurationSeconds, legacy?.defaultDurationSeconds, undefined) !== undefined
      ? { defaultDurationSeconds: firstDefined(canonical?.defaultDurationSeconds, route?.defaultDurationSeconds, legacy?.defaultDurationSeconds, undefined) }
      : {}),
  };
  const aspectRatioMode = firstDefined(canonical?.aspectRatioMode, route?.aspectRatioMode, legacy?.aspectRatioMode, undefined);
  return {
    source,
    resolutions: normalizeStrings(firstDefined(canonical?.resolutions, route?.resolutions, legacy?.resolutions, [])),
    ...(firstDefined(canonical?.defaultResolution, route?.defaultResolution, legacy?.defaultResolution, undefined)
      ? { defaultResolution: firstDefined(canonical?.defaultResolution, route?.defaultResolution, legacy?.defaultResolution, undefined)! }
      : {}),
    durations: getVideoDurationOptions(durationCapabilities),
    ...(durationMode ? { durationMode } : {}),
    ...(durationRange ? { durationRange: { ...durationRange, step: durationRange.step ?? 1 } } : {}),
    ...(durationCapabilities.defaultDurationSeconds !== undefined
      ? { defaultDurationSeconds: durationCapabilities.defaultDurationSeconds }
      : {}),
    aspectRatios: normalizeStrings(firstDefined(canonical?.aspectRatios, route?.aspectRatios, legacy?.aspectRatios, [])),
    ...(aspectRatioMode ? { aspectRatioMode } : {}),
    ...(firstDefined(canonical?.defaultAspectRatio, route?.defaultAspectRatio, legacy?.defaultAspectRatio, undefined)
      ? { defaultAspectRatio: firstDefined(canonical?.defaultAspectRatio, route?.defaultAspectRatio, legacy?.defaultAspectRatio, undefined)! }
      : {}),
    referenceImages: supportsReferenceImages ? referenceImages : 0,
    referenceVideos: supportsReferenceVideo ? referenceVideos : 0,
    referenceAudios: supportsAudioReference ? referenceAudios : 0,
    minReferenceImages: normalizeLimit(firstDefined(canonical?.minReferenceImages, route?.minReferenceImages, legacy?.minReferenceImages, 0)),
    minReferenceVideos: normalizeLimit(firstDefined(canonical?.minReferenceVideos, route?.minReferenceVideos, legacy?.minReferenceVideos, 0)),
    minReferenceAudios: normalizeLimit(firstDefined(canonical?.minReferenceAudios, route?.minReferenceAudios, legacy?.minReferenceAudios, 0)),
    supportsFirstFrame,
    supportsLastFrame,
    supportsFirstLastFrame,
    supportsTextPrompt,
    firstLastFrame,
    inputModes,
    outputFormats: normalizeStrings(firstDefined(canonical?.supportedOutputFormats, route?.supportedOutputFormats, legacy?.supportedOutputFormats, [])),
    maxOutputs: Math.max(1, normalizeLimit(firstDefined(canonical?.maxOutputs, route?.maxOutputs, legacy?.maxOutputs, 4), 4)),
    supportsReferenceImages,
    supportsReferenceVideo,
    supportsAudioReference,
  };
};

let lastSuccessfulCatalogSnapshot: CloudImageModelsResult | null = null;

export const cacheSuccessfulAiCatalog = (snapshot: CloudImageModelsResult) => {
  lastSuccessfulCatalogSnapshot = snapshot;
  return snapshot;
};

export const getCachedAiCatalog = () => lastSuccessfulCatalogSnapshot;

export const clearCachedAiCatalog = () => {
  lastSuccessfulCatalogSnapshot = null;
};

export const clearCachedAiCatalogForTests = clearCachedAiCatalog;

export const getDefaultAiCatalogModelId = (
  snapshot: CloudImageModelsResult,
  modality: 'image' | 'video',
) => {
  const catalog = getAiCatalogModels(snapshot, modality);
  const configured = String(
    modality === 'image'
      ? snapshot.defaultImageModel || snapshot.defaultModel || ''
      : snapshot.defaultVideoModel || '',
  ).trim();
  const configuredModel = findAiCatalogModel(catalog, configured);
  if (configuredModel) return configuredModel.id;
  const catalogDefault = catalog.find(model => model.isDefault);
  if (catalogDefault) return catalogDefault.id;
  if (modality === 'video') {
    for (const channel of snapshot.videoChannels || []) {
      const channelDefault = findAiCatalogModel(catalog, channel.defaultModel);
      if (channelDefault) return channelDefault.id;
    }
  }
  return catalog[0]?.id || '';
};

/**
 * Called only after a successful catalog refresh. A failed request must never
 * invoke this helper, so offline startup cannot erase a saved selection.
 */
export const reconcileStaleCanvasAiModels = (
  items: CanvasImageItem[],
  snapshot: CloudImageModelsResult,
) => {
  const imageCatalog = getAiCatalogModels(snapshot, 'image');
  const videoCatalog = getAiCatalogModels(snapshot, 'video');
  const defaultImage = getDefaultAiCatalogModelId(snapshot, 'image');
  const defaultVideo = getDefaultAiCatalogModelId(snapshot, 'video');
  let changed = false;
  const next = items.map(item => {
    const ai = item.ai;
    const modality = ai?.type === 'image-generator'
      ? 'image'
      : ai?.type === 'video-generator'
        ? 'video'
        : null;
    if (!modality || !ai || ai.credentialSource === 'local') return item;
    const catalog = modality === 'image' ? imageCatalog : videoCatalog;
    if (catalog.length === 0) return item;
    const requestedCanonicalModel = ai.providerCandidates
      ?.find(candidate => candidate.canonicalModelId)?.canonicalModelId
      || String(ai.model || '').trim();
    const current = findAiCatalogModel(catalog, requestedCanonicalModel)
      || findAiCatalogModel(catalog, ai.model);
    const fallback = modality === 'image' ? defaultImage : defaultVideo;
    // Catalog refreshes may be temporarily incomplete. A model explicitly
    // stored on the node is user intent and must never be replaced with the
    // server default (often Nano Banana Pro). Only an unconfigured node may
    // adopt the default; known aliases are still canonicalized safely.
    const nextModel = current?.id || (!requestedCanonicalModel ? fallback : '');
    if (!nextModel || ai.model === nextModel) return item;
    changed = true;
    return {
      ...item,
      ai: {
        ...ai,
        model: nextModel,
        providerChannelId: undefined,
        providerCandidates: undefined,
      },
    };
  });
  return changed ? next : items;
};

/**
 * Reconcile the same explicit model identity inside expanded workflow
 * instances, imported templates, and runtime node snapshots.  The traversal
 * only touches objects that already carry an `ai.model`; it never fuzzy-maps
 * names or invents a default for a non-empty stale model.
 */
export const reconcileStaleCanvasWorkflowModels = (
  value: unknown,
  snapshot: CloudImageModelsResult,
): unknown => {
  const imageCatalog = getAiCatalogModels(snapshot, 'image');
  const videoCatalog = getAiCatalogModels(snapshot, 'video');
  const defaultImage = getDefaultAiCatalogModelId(snapshot, 'image');
  const defaultVideo = getDefaultAiCatalogModelId(snapshot, 'video');
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== 'object') return node;
    const record = node as Record<string, unknown>;
    let next: Record<string, unknown> = record;
    const ai = record.ai && typeof record.ai === 'object' && !Array.isArray(record.ai)
      ? record.ai as Record<string, unknown>
      : null;
    if (ai && ai.credentialSource !== 'local') {
      const modality = ai.type === 'image-generator' ? 'image' : ai.type === 'video-generator' ? 'video' : null;
      const catalog = modality === 'image' ? imageCatalog : videoCatalog;
      if (modality && catalog.length > 0) {
        const requested = String(ai.model || '').trim();
        const current = findAiCatalogModel(catalog, requested);
        const nextModel = current?.id || (!requested ? (modality === 'image' ? defaultImage : defaultVideo) : '');
        if (nextModel && nextModel !== ai.model) {
          next = { ...next, ai: { ...ai, model: nextModel, providerChannelId: undefined, providerCandidates: undefined } };
        }
      }
    }
    for (const key of ['workflowGroup', 'nodeSnapshots', 'template', 'workflow', 'nodes']) {
      if (key in next) {
        const updated = visit(next[key]);
        if (updated !== next[key]) next = { ...next, [key]: updated };
      }
    }
    return next;
  };
  return visit(value);
};
