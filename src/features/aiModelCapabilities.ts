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
  durations: number[];
  aspectRatios: string[];
  referenceImages: number;
  referenceVideos: number;
  referenceAudios: number;
  minReferenceImages: number;
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

export const normalizeAiModelCapabilities = (
  value?: AiModelCapabilities | null,
): AiModelCapabilities | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const normalized: AiModelCapabilities = {};
  if (value.resolutions !== undefined) normalized.resolutions = normalizeStrings(value.resolutions);
  if (value.aspectRatios !== undefined) normalized.aspectRatios = normalizeStrings(value.aspectRatios);
  if (value.aspectRatiosByResolution !== undefined) {
    normalized.aspectRatiosByResolution = normalizeStringArrayMap(value.aspectRatiosByResolution);
  }
  if (value.durations !== undefined) normalized.durations = normalizeDurations(value.durations);
  if (value.supportedInputModes !== undefined) normalized.supportedInputModes = normalizeStrings(value.supportedInputModes);
  if (value.supportedOutputFormats !== undefined) normalized.supportedOutputFormats = normalizeStrings(value.supportedOutputFormats);
  const limitKeys: Array<keyof Pick<AiModelCapabilities,
    'maxReferenceImages' | 'maxReferenceVideos' | 'maxReferenceAudios' | 'minReferenceImages' | 'maxOutputs'
  >> = ['maxReferenceImages', 'maxReferenceVideos', 'maxReferenceAudios', 'minReferenceImages', 'maxOutputs'];
  const limitMaximums: Record<(typeof limitKeys)[number], number> = {
    maxReferenceImages: 32,
    maxReferenceVideos: 8,
    maxReferenceAudios: 8,
    minReferenceImages: 32,
    maxOutputs: 16,
  };
  limitKeys.forEach(key => {
    if (value[key] !== undefined) {
      normalized[key] = Math.min(limitMaximums[key], normalizeLimit(value[key]));
    }
  });
  const booleanKeys: Array<keyof Pick<AiModelCapabilities,
    'supportsReferenceImages' | 'supportsReferenceVideo' | 'supportsAudioReference'
    | 'supportsFirstLastFrame' | 'supportsTransparentBackground'
  >> = [
    'supportsReferenceImages',
    'supportsReferenceVideo',
    'supportsAudioReference',
    'supportsFirstLastFrame',
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
  if (explicit.length > 0) return explicit;

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

export const getImageAspectRatioOptionsForResolution = (
  capabilities: Pick<ResolvedImageModelCapabilities, 'aspectRatios' | 'aspectRatiosByResolution'>,
  resolution?: string | null,
) => {
  const key = String(resolution || '').trim().toLowerCase();
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
  const supportsAudioReference = firstDefined(canonical?.supportsAudioReference, route?.supportsAudioReference, legacy?.supportsAudioReference, referenceAudios > 0);
  const firstLastFrame = firstDefined(
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
  const inputModes = normalizeStrings(firstDefined(
    canonical?.supportedInputModes,
    route?.supportedInputModes,
    legacy?.supportedInputModes,
    firstLastFrame ? ['reference', 'first_last_frame'] : ['reference'],
  )).filter(mode => firstLastFrame || !supportsFirstLastFrameMode([mode]));
  return {
    source,
    resolutions: normalizeStrings(firstDefined(canonical?.resolutions, route?.resolutions, legacy?.resolutions, [])),
    durations: normalizeDurations(firstDefined(canonical?.durations, route?.durations, legacy?.durations, [])),
    aspectRatios: normalizeStrings(firstDefined(canonical?.aspectRatios, route?.aspectRatios, legacy?.aspectRatios, [])),
    referenceImages: supportsReferenceImages ? referenceImages : 0,
    referenceVideos: supportsReferenceVideo ? referenceVideos : 0,
    referenceAudios: supportsAudioReference ? referenceAudios : 0,
    minReferenceImages: normalizeLimit(firstDefined(canonical?.minReferenceImages, route?.minReferenceImages, legacy?.minReferenceImages, 0)),
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

export const clearCachedAiCatalogForTests = () => {
  lastSuccessfulCatalogSnapshot = null;
};

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
    const current = findAiCatalogModel(catalog, ai.model);
    const fallback = modality === 'image' ? defaultImage : defaultVideo;
    const nextModel = current?.id || fallback;
    if (!nextModel || (ai.model === nextModel && current?.id === ai.model)) return item;
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
