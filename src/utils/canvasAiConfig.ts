import type { RoundedSelectOption } from '../components/RoundedSelect';
import type { AiGatewayKind } from '../features/agentModel';
import type {
  CanvasAiCredentialSource,
  CanvasAiModelCandidate,
  CanvasAiProvider,
} from '../features/canvasModel';
import {
  CANVAS_AI_PROVIDER_OPTIONS,
  NEW_API_ENDPOINT_DEFAULT,
  NEW_API_ENDPOINT_PLACEHOLDER,
  NEW_API_IMAGE_MODEL_DEFAULT,
  NEW_API_VIDEO_MODEL_DEFAULT,
  OPENAI_COMPATIBLE_ENDPOINT_DEFAULT,
  OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT,
  XAIS_CHAT_ENDPOINT_DEFAULT,
  MIKOTO_ENDPOINT_DEFAULT,
  XAIS_CHAT_IMAGE_MODEL_DEFAULT,
  XAIS_CHAT_IMAGE_MODEL_OPTIONS,
  XAIS_CHAT_VIDEO_MODEL_DEFAULT,
  isOpenAiLikeCanvasAiProvider,
  normalizeNewApiBaseEndpoint,
  normalizeXaisImage2Model,
} from '../features/canvasAiImage';

export const CANVAS_AI_PROVIDER_STORAGE_KEY = 'drawer_canvas_ai_provider';
export const CANVAS_AI_CREDENTIAL_SOURCE_STORAGE_KEY = 'drawer_canvas_ai_credential_source';
export const CANVAS_AI_PROVIDER_DEFAULT_VERSION_STORAGE_KEY = 'drawer_canvas_ai_provider_default_version';
export const CANVAS_AI_PROVIDER_DEFAULT_VERSION = 'xais-chat-default';
export const CANVAS_AI_API_KEY_STORAGE_PREFIX = 'drawer_canvas_ai_api_key_';
export const CANVAS_AI_NEW_API_VIDEO_KEY_STORAGE_KEY = 'drawer_canvas_ai_new_api_video_key';
export const CANVAS_AI_ENDPOINT_STORAGE_KEY = 'drawer_canvas_ai_endpoint';
export const CANVAS_AI_ENDPOINT_STORAGE_PREFIX = 'drawer_canvas_ai_endpoint_';
export const CANVAS_AI_HEADERS_STORAGE_PREFIX = 'drawer_canvas_ai_headers_';
export const CANVAS_AI_API_PROVIDER_STORAGE_PREFIX = 'drawer_canvas_ai_api_provider_';
export const CANVAS_AI_OPENAI_MODELS_STORAGE_KEY = 'drawer_canvas_ai_openai_models';
export const CANVAS_AI_NEW_API_MODELS_STORAGE_KEY = 'drawer_canvas_ai_new_api_models';
export const CANVAS_AI_XAIS_MODELS_STORAGE_KEY = 'drawer_canvas_ai_xais_models';
export const CANVAS_AI_MIKOTO_MODELS_STORAGE_KEY = 'drawer_canvas_ai_mikoto_models';
export const CANVAS_AI_OUTPUT_FORMATS = ['jpg', 'png'];
export const CANVAS_AI_IMAGE_RESOLUTIONS = ['1k', '2k', '4k'];
export const CANVAS_AI_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'];
export const CANVAS_AI_VIDEO_DURATIONS = Array.from({ length: 12 }, (_, index) => index + 4);
export const CANVAS_AI_DEFAULT_OUTPUT_FORMAT = 'jpg';
export const CANVAS_AI_DEFAULT_COUNT = 1;
export const CANVAS_AI_DEFAULT_IMAGE_RESOLUTION = '2k';
export const CANVAS_AI_DEFAULT_VIDEO_DURATION = 15;
export const CANVAS_AI_DEFAULT_VIDEO_RESOLUTION = '720p';
export const CANVAS_AI_VIDEO_REFERENCE_SHARE_KEEPALIVE_MS = 30 * 60 * 1000;
export const CANVAS_AI_IMAGE_REFERENCE_SHARE_KEEPALIVE_MS = 30 * 60 * 1000;
export const CANVAS_AI_OUTPUT_SOURCE_RECOVERY_CONCURRENCY = 2;
export const CANVAS_AI_INPUT_IMAGE_MAX_EDGE = 1920;
export const CANVAS_AI_INPUT_IMAGE_MIN_EDGE = 1536;
export const CANVAS_AI_INPUT_IMAGE_QUALITY = 0.9;
export const CANVAS_AI_INPUT_IMAGE_MIN_QUALITY = 0.82;
export const CANVAS_AI_INPUT_IMAGE_TARGET_BYTES = 2.5 * 1024 * 1024;
export const CANVAS_AI_PROVIDER_SELECT_OPTIONS: RoundedSelectOption[] = CANVAS_AI_PROVIDER_OPTIONS.map(provider => ({
  value: provider.value,
  label: provider.label,
}));
export const CANVAS_AI_DEFAULT_PROVIDER: CanvasAiProvider = 'xais-chat';
export const CANVAS_AI_PROVIDER_VALUES: CanvasAiProvider[] = ['xais-chat', 'new-api', 'mikoto', 'openai-compatible', 'custom'];
export const CANVAS_AI_OUTPUT_FORMAT_OPTIONS: RoundedSelectOption[] = CANVAS_AI_OUTPUT_FORMATS.map(format => ({
  value: format,
  label: format.toUpperCase(),
}));
export const CANVAS_AI_IMAGE_RESOLUTION_OPTIONS: RoundedSelectOption[] = CANVAS_AI_IMAGE_RESOLUTIONS.map(resolution => ({
  value: resolution,
  label: resolution.toUpperCase(),
}));
export const CANVAS_AI_VIDEO_RESOLUTION_OPTIONS: RoundedSelectOption[] = CANVAS_AI_VIDEO_RESOLUTIONS.map(resolution => ({
  value: resolution,
  label: resolution,
}));
export const CANVAS_AI_VIDEO_DURATION_OPTIONS: RoundedSelectOption[] = CANVAS_AI_VIDEO_DURATIONS.map(duration => ({
  value: String(duration),
  label: `${duration}秒`,
}));

export const getCanvasAiDefaultModel = (provider: CanvasAiProvider, mediaType: 'image' | 'video' = 'image') => (
  mediaType === 'video'
    ? provider === 'xais-chat' ? XAIS_CHAT_VIDEO_MODEL_DEFAULT : provider === 'new-api' ? NEW_API_VIDEO_MODEL_DEFAULT : ''
    : provider === 'xais-chat'
    ? XAIS_CHAT_IMAGE_MODEL_DEFAULT
    : provider === 'new-api'
      ? NEW_API_IMAGE_MODEL_DEFAULT
    : provider === 'mikoto'
      ? ''
    : OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT
);
export const CANVAS_REFERENCE_IMAGE_WORKFLOW_PROVIDER: CanvasAiProvider = 'xais-chat';
export const CANVAS_REFERENCE_IMAGE_WORKFLOW_MODEL = XAIS_CHAT_IMAGE_MODEL_DEFAULT;
export const getReferenceImageWorkflowAiConfig = () => ({
  provider: CANVAS_REFERENCE_IMAGE_WORKFLOW_PROVIDER,
  model: CANVAS_REFERENCE_IMAGE_WORKFLOW_MODEL,
});
export const getCanvasAiDefaultEndpoint = (provider: CanvasAiProvider) => (
  provider === 'xais-chat'
    ? XAIS_CHAT_ENDPOINT_DEFAULT
    : provider === 'new-api'
      ? NEW_API_ENDPOINT_DEFAULT
    : provider === 'mikoto'
      ? MIKOTO_ENDPOINT_DEFAULT
    : provider === 'openai-compatible'
      ? OPENAI_COMPATIBLE_ENDPOINT_DEFAULT
      : ''
);
export const readStoredCanvasAiOpenAiModels = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_OPENAI_MODELS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
  } catch (_) {
    return [];
  }
};
export const readStoredCanvasAiNewApiModels = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_NEW_API_MODELS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
  } catch (_) {
    return [];
  }
};
export const readStoredCanvasAiXaisModels = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_XAIS_MODELS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
  } catch (_) {
    return [];
  }
};
export const readStoredCanvasAiMikotoModels = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_MIKOTO_MODELS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
  } catch (_) {
    return [];
  }
};
export const isCanvasAiEndpointEditable = (provider: CanvasAiProvider) => isOpenAiLikeCanvasAiProvider(provider) || provider === 'xais-chat';
export const isCanvasAiEndpointVisible = (provider: CanvasAiProvider) => isOpenAiLikeCanvasAiProvider(provider);
export const isCanvasAiRemoteModelProvider = (provider: CanvasAiProvider) => isOpenAiLikeCanvasAiProvider(provider) || provider === 'xais-chat';
export const getCanvasAiEndpointPlaceholder = (provider: CanvasAiProvider) => (
  provider === 'xais-chat'
    ? XAIS_CHAT_ENDPOINT_DEFAULT
    : provider === 'new-api'
      ? NEW_API_ENDPOINT_PLACEHOLDER
      : provider === 'mikoto'
        ? MIKOTO_ENDPOINT_DEFAULT
      : OPENAI_COMPATIBLE_ENDPOINT_DEFAULT
);
export const normalizeCanvasAiXaisEndpoint = (endpoint: string) => {
  const trimmed = (endpoint || XAIS_CHAT_ENDPOINT_DEFAULT).trim().replace(/\/+$/, '');
  return trimmed
    .replace(/\/v1\/(?:models|images\/generations|images\/edits|chat\/completions)$/i, '/v1')
    .replace(/\/models$/i, '');
};
export const getCanvasAiEndpointForRequest = (provider: CanvasAiProvider, endpoint: string) => {
  if (provider === 'xais-chat') {
    const trimmed = endpoint.trim();
    if (!trimmed || /api\.openai\.com/i.test(trimmed)) {
      return XAIS_CHAT_ENDPOINT_DEFAULT;
    }
    return normalizeCanvasAiXaisEndpoint(trimmed);
  }
  if (provider === 'new-api') return normalizeNewApiBaseEndpoint(endpoint);
  return isCanvasAiEndpointEditable(provider)
    ? endpoint
    : getCanvasAiDefaultEndpoint(provider);
};
export const getCanvasAiEndpointForModels = (provider: CanvasAiProvider, endpoint: string) => {
  if (provider === 'new-api') return normalizeNewApiBaseEndpoint(endpoint);
  if (provider !== 'xais-chat') return endpoint.trim();
  const base = normalizeCanvasAiXaisEndpoint(endpoint);
  return /\/v1$/i.test(base) ? base : `${base}/v1`;
};
export const isCanvasAiLikelyOpenAiImageModel = (model: string) => {
  const normalized = model.trim().toLowerCase();
  return /^gpt-image-\d/.test(normalized)
    || /^dall-e-\d/.test(normalized)
    || /(?:^|[-_/])(image|img|picture|photo|vision|visual|flux|sdxl|sd3|stable-diffusion|imagen|ideogram|recraft|seedream|jimeng|kolors|hidream|nano-banana|nanobanana)(?:$|[-_/])/i.test(model)
    || /(?:image|img|picture|photo|vision|visual|flux|sdxl|stable.?diffusion|imagen|ideogram|recraft|seedream|jimeng|kolors|hidream|nano.?banana)/i.test(model);
};
export const isCanvasAiXaisWorkerModel = (model?: string | null) => {
  const normalized = normalizeXaisImage2Model(model);
  return XAIS_CHAT_IMAGE_MODEL_OPTIONS.some(option => option.value === normalized);
};
export const getCanvasAiRemoteStorageKey = (provider: CanvasAiProvider) => (
  provider === 'xais-chat'
    ? CANVAS_AI_XAIS_MODELS_STORAGE_KEY
    : provider === 'new-api'
      ? CANVAS_AI_NEW_API_MODELS_STORAGE_KEY
      : provider === 'mikoto'
        ? CANVAS_AI_MIKOTO_MODELS_STORAGE_KEY
      : CANVAS_AI_OPENAI_MODELS_STORAGE_KEY
);
export const sortCanvasAiModelsForProvider = (provider: CanvasAiProvider, models: string[]) => {
  if (provider !== 'xais-chat') return [...models].sort((a, b) => a.localeCompare(b));
  const preferred = XAIS_CHAT_IMAGE_MODEL_OPTIONS.map(option => option.value);
  return [...models].sort((a, b) => {
    const aIndex = preferred.indexOf(a);
    const bIndex = preferred.indexOf(b);
    if (aIndex >= 0 || bIndex >= 0) {
      if (aIndex < 0) return 1;
      if (bIndex < 0) return -1;
      return aIndex - bIndex;
    }
    return a.localeCompare(b);
  });
};
export const normalizeCanvasAiProvider = (provider?: string | null): CanvasAiProvider => (
  CANVAS_AI_PROVIDER_VALUES.includes(provider as CanvasAiProvider)
    ? provider as CanvasAiProvider
    : CANVAS_AI_DEFAULT_PROVIDER
);
export const canvasAiGatewayKindForProvider = (provider: CanvasAiProvider): AiGatewayKind => (
  provider === 'new-api'
    ? 'new_api'
    : provider === 'xais-chat'
      ? 'xais'
      : provider === 'custom'
        ? 'custom'
        : 'openai_compatible'
);
export const defaultCanvasAiApiProvider = (provider: CanvasAiProvider) => (
  provider === 'new-api'
    ? 'new-api'
    : provider === 'xais-chat'
      ? 'xais-chat'
      : provider === 'mikoto'
        ? 'mikoto'
      : provider === 'custom'
          ? 'custom'
          : 'openai-compatible'
);
export const canvasAiProviderForGateway = (
  gatewayKind?: AiGatewayKind | null,
  provider?: string | null,
): CanvasAiProvider => {
  if (gatewayKind === 'new_api') return 'new-api';
  if (gatewayKind === 'xais') return 'xais-chat';
  if (gatewayKind === 'openai_compatible') return 'openai-compatible';
  if (gatewayKind === 'custom') {
    return CANVAS_AI_PROVIDER_VALUES.includes(provider as CanvasAiProvider)
      ? provider as CanvasAiProvider
      : 'custom';
  }
  return normalizeCanvasAiProvider(provider);
};
export const canvasAiProviderForCloudKind = (provider?: string | null): CanvasAiProvider => {
  const normalized = String(provider || '').trim().toUpperCase();
  if (normalized === 'NEW_API') return 'new-api';
  if (normalized === 'XAIS') return 'xais-chat';
  if (normalized === 'MIKOTO') return 'mikoto';
  return normalizeCanvasAiProvider(provider);
};
export const canvasAiModelChoiceValue = (
  source: CanvasAiCredentialSource,
  provider: CanvasAiProvider,
  model: string,
  providerChannelId?: string,
) => JSON.stringify([source, provider, model, providerChannelId || '']);
export const canvasAiGroupedModelChoiceValue = (
  source: CanvasAiCredentialSource,
  candidate: CanvasAiModelCandidate,
  candidates: CanvasAiModelCandidate[],
) => JSON.stringify([
  source,
  candidate.provider,
  candidate.model,
  candidate.providerChannelId || '',
  candidates.length > 1 ? candidates : undefined,
]);
export const parseCanvasAiModelChoiceValue = (value: string) => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || (parsed.length !== 3 && parsed.length !== 4 && parsed.length !== 5)) return null;
    const [source, provider, model, providerChannelId, rawCandidates] = parsed;
    if (source !== 'wallet' && source !== 'local') return null;
    if (!CANVAS_AI_PROVIDER_VALUES.includes(provider as CanvasAiProvider)) return null;
    if (typeof model !== 'string' || !model.trim()) return null;
    const providerCandidates = Array.isArray(rawCandidates)
      ? rawCandidates.flatMap(value => {
        if (!value || typeof value !== 'object') return [];
        const candidate = value as Partial<CanvasAiModelCandidate>;
        if ((candidate.source !== 'wallet' && candidate.source !== 'local')
          || !CANVAS_AI_PROVIDER_VALUES.includes(candidate.provider as CanvasAiProvider)
          || typeof candidate.model !== 'string' || !candidate.model.trim()) return [];
        return [{
          source: candidate.source,
          provider: candidate.provider as CanvasAiProvider,
          model: candidate.model.trim(),
          providerChannelId: typeof candidate.providerChannelId === 'string' && candidate.providerChannelId.trim()
            ? candidate.providerChannelId.trim()
            : undefined,
          capabilities: Array.isArray(candidate.capabilities)
            ? Array.from(new Set(candidate.capabilities
              .filter((capability): capability is string => typeof capability === 'string')
              .map(capability => capability.trim().toUpperCase())
              .filter(Boolean)))
            : undefined,
        } as CanvasAiModelCandidate];
      })
      : undefined;
    return {
      source: source as CanvasAiCredentialSource,
      provider: provider as CanvasAiProvider,
      model: model.trim(),
      providerChannelId: typeof providerChannelId === 'string' && providerChannelId.trim()
        ? providerChannelId.trim()
        : undefined,
      providerCandidates: providerCandidates && providerCandidates.length > 1 ? providerCandidates : undefined,
    };
  } catch {
    return null;
  }
};
export const getStoredCanvasAiProvider = () => {
  const storedProvider = localStorage.getItem(CANVAS_AI_PROVIDER_STORAGE_KEY);
  return normalizeCanvasAiProvider(storedProvider);
};
export const getStoredCanvasAiCredentialSource = (): CanvasAiCredentialSource => {
  return localStorage.getItem(CANVAS_AI_CREDENTIAL_SOURCE_STORAGE_KEY) === 'local' ? 'local' : 'wallet';
};
export const getCanvasAiApiKeyStorageKey = (provider: CanvasAiProvider) => `${CANVAS_AI_API_KEY_STORAGE_PREFIX}${provider}`;
export const getCanvasAiEndpointStorageKey = (provider: CanvasAiProvider) => `${CANVAS_AI_ENDPOINT_STORAGE_PREFIX}${provider}`;
export const getCanvasAiHeadersStorageKey = (provider: CanvasAiProvider) => `${CANVAS_AI_HEADERS_STORAGE_PREFIX}${provider}`;
export const getCanvasAiApiProviderStorageKey = (provider: CanvasAiProvider) => `${CANVAS_AI_API_PROVIDER_STORAGE_PREFIX}${provider}`;
export const getStoredCanvasAiApiKey = (provider: CanvasAiProvider) => {
  const scopedKey = localStorage.getItem(getCanvasAiApiKeyStorageKey(provider));
  if (scopedKey !== null) return scopedKey;
  return '';
};
export const getStoredCanvasAiEndpoint = (provider: CanvasAiProvider) => {
  const scopedEndpoint = (localStorage.getItem(getCanvasAiEndpointStorageKey(provider)) || '').trim();
  if (scopedEndpoint) return scopedEndpoint;
  const storedProvider = normalizeCanvasAiProvider(localStorage.getItem(CANVAS_AI_PROVIDER_STORAGE_KEY));
  const legacyEndpoint = (localStorage.getItem(CANVAS_AI_ENDPOINT_STORAGE_KEY) || '').trim();
  if (storedProvider === provider && legacyEndpoint) return legacyEndpoint;
  return getCanvasAiDefaultEndpoint(provider);
};
export const getStoredCanvasAiHeadersText = (provider: CanvasAiProvider) => (
  localStorage.getItem(getCanvasAiHeadersStorageKey(provider)) || '{}'
);
export const getStoredCanvasAiApiProvider = (provider: CanvasAiProvider) => (
  localStorage.getItem(getCanvasAiApiProviderStorageKey(provider)) || defaultCanvasAiApiProvider(provider)
);
export const parseCanvasAiHeaders = (value: string) => {
  const parsed = JSON.parse(value.trim() || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Canvas 自定义 Headers 必须是 JSON 对象');
  }
  return Object.fromEntries(
    Object.entries(parsed)
      .map(([key, headerValue]) => [key.trim(), String(headerValue).trim()])
      .filter(([key, headerValue]) => key && headerValue),
  );
};
export const getCanvasAiApiKeyPlaceholder = (provider: CanvasAiProvider) => (
  provider === 'xais-chat'
    ? 'Xais / DCHAI API Key'
    : provider === 'new-api'
      ? 'New API Key'
      : provider === 'mikoto'
        ? 'Mikoto API Key'
      : 'API Key'
);
