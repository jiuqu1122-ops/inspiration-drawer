import type { RoundedSelectOption } from '../components/RoundedSelect';
import type { CanvasAiProvider } from './canvasModel';
import {
  CANVAS_AI_PROVIDER_OPTIONS,
  CANVAS_AI_VIDEO_PROVIDER_OPTIONS,
  NEW_API_ENDPOINT_DEFAULT,
  NEW_API_ENDPOINT_PLACEHOLDER,
  NEW_API_IMAGE_MODEL_DEFAULT,
  NEW_API_IMAGE_MODEL_OPTIONS,
  CANVAS_SEEDANCE_2_MODEL,
  MIKOTO_VIDEO_MODEL_OPTIONS,
  OPENAI_COMPATIBLE_ENDPOINT_DEFAULT,
  OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT,
  OPENAI_COMPATIBLE_IMAGE_MODEL_OPTIONS,
  XAIS_CHAT_ENDPOINT_DEFAULT,
  MIKOTO_ENDPOINT_DEFAULT,
  XAIS_CHAT_IMAGE_MODEL_DEFAULT,
  XAIS_CHAT_IMAGE_MODEL_OPTIONS,
  XAIS_CHAT_VIDEO_MODEL_DEFAULT,
  XAIS_CHAT_VIDEO_MODEL_OPTIONS,
  getXaisImage2RatioOptions,
  isOpenAiLikeCanvasAiProvider,
  isXaisImage2Model,
  normalizeNewApiBaseEndpoint,
  normalizeXaisImage2Model,
  resolveXaisImage2Ratio,
} from './canvasAiImage';
import { parseCanvasAspectRatioValue } from './canvasAiNodeLayout';

export const CANVAS_AI_PROVIDER_STORAGE_KEY = 'drawer_canvas_ai_provider';
export const CANVAS_AI_PROVIDER_DEFAULT_VERSION_STORAGE_KEY = 'drawer_canvas_ai_provider_default_version';
export const CANVAS_AI_PROVIDER_DEFAULT_VERSION = 'xais-chat-default';
export const CANVAS_AI_API_KEY_STORAGE_PREFIX = 'drawer_canvas_ai_api_key_';
export const CANVAS_AI_NEW_API_VIDEO_KEY_STORAGE_KEY = 'drawer_canvas_ai_new_api_video_key';
export const CANVAS_AI_ENDPOINT_STORAGE_KEY = 'drawer_canvas_ai_endpoint';
export const CANVAS_AI_ENDPOINT_STORAGE_PREFIX = 'drawer_canvas_ai_endpoint_';
export const CANVAS_AI_OPENAI_MODELS_STORAGE_KEY = 'drawer_canvas_ai_openai_models';
export const CANVAS_AI_NEW_API_MODELS_STORAGE_KEY = 'drawer_canvas_ai_new_api_models';
export const CANVAS_AI_XAIS_MODELS_STORAGE_KEY = 'drawer_canvas_ai_xais_models';
export const CANVAS_AI_MIKOTO_MODELS_STORAGE_KEY = 'drawer_canvas_ai_mikoto_models';

export const CANVAS_AI_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];
export const CANVAS_AI_OUTPUT_FORMATS = ['jpg', 'png'];
export const CANVAS_AI_COUNTS = [1, 2, 3, 4];
export const CANVAS_AI_IMAGE_RESOLUTIONS = ['1k', '2k', '4k'];
export const CANVAS_AI_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'];
export const CANVAS_AI_VIDEO_DURATIONS = Array.from({ length: 12 }, (_, index) => index + 4);
export const CANVAS_AI_DEFAULT_ASPECT_RATIO = '16:9';
export const CANVAS_AI_DEFAULT_OUTPUT_FORMAT = 'jpg';
export const CANVAS_AI_DEFAULT_COUNT = 1;
export const CANVAS_AI_DEFAULT_IMAGE_RESOLUTION = '2k';
export const CANVAS_AI_DEFAULT_VIDEO_DURATION = 15;
export const CANVAS_AI_DEFAULT_VIDEO_RESOLUTION = '720p';
export const CANVAS_AI_VIDEO_REFERENCE_SHARE_KEEPALIVE_MS = 30 * 60 * 1000;
export const CANVAS_AI_INPUT_IMAGE_MAX_EDGE = 1920;
export const CANVAS_AI_INPUT_IMAGE_MIN_EDGE = 1536;
export const CANVAS_AI_INPUT_IMAGE_QUALITY = 0.9;
export const CANVAS_AI_INPUT_IMAGE_MIN_QUALITY = 0.82;
export const CANVAS_AI_INPUT_IMAGE_TARGET_BYTES = 2.5 * 1024 * 1024;

export const CANVAS_AI_PROVIDER_SELECT_OPTIONS: RoundedSelectOption[] = CANVAS_AI_PROVIDER_OPTIONS.map(provider => ({
  value: provider.value,
  label: provider.label,
}));
export const CANVAS_AI_VIDEO_PROVIDER_SELECT_OPTIONS: RoundedSelectOption[] = CANVAS_AI_VIDEO_PROVIDER_OPTIONS.map(provider => ({
  value: provider.value,
  label: provider.label,
}));
export const CANVAS_AI_DEFAULT_PROVIDER: CanvasAiProvider = 'xais-chat';
export const CANVAS_AI_PROVIDER_VALUES: CanvasAiProvider[] = ['xais-chat', 'new-api', 'mikoto', 'bigmodel', 'openai-compatible', 'custom'];
export const CANVAS_AI_ASPECT_RATIO_OPTIONS: RoundedSelectOption[] = CANVAS_AI_ASPECT_RATIOS.map(ratio => ({
  value: ratio,
  label: ratio,
}));
export const CANVAS_AI_OUTPUT_FORMAT_OPTIONS: RoundedSelectOption[] = CANVAS_AI_OUTPUT_FORMATS.map(format => ({
  value: format,
  label: format.toUpperCase(),
}));
export const CANVAS_AI_COUNT_OPTIONS: RoundedSelectOption[] = CANVAS_AI_COUNTS.map(count => ({
  value: String(count),
  label: String(count),
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
export const CANVAS_AI_VIDEO_INPUT_MODE_OPTIONS: RoundedSelectOption[] = [
  { value: 'REF', label: '参考图' },
  { value: 'FLF', label: '首尾帧' },
];
export const CANVAS_RIFE_RATE_OPTIONS: RoundedSelectOption[] = [
  { value: 'factor-2', label: '2× 补帧' },
  { value: 'factor-4', label: '4× 补帧' },
  { value: 'target-30', label: '目标 30fps' },
  { value: 'target-48', label: '目标 48fps' },
  { value: 'target-60', label: '目标 60fps' },
  { value: 'target-120', label: '目标 120fps' },
];
export const CANVAS_VIDEO_CFR_MODE_OPTIONS: RoundedSelectOption[] = [
  { value: 'auto', label: '自动标准化' },
  { value: '24', label: '24fps CFR' },
  { value: '30', label: '30fps CFR' },
  { value: 'off', label: '不处理' },
];
export const CANVAS_RIFE_AUTO_TARGET_FPS_OPTIONS: RoundedSelectOption[] = [
  { value: 'auto-2x', label: '自动 2x' },
];
export const CANVAS_RIFE_MODE_OPTIONS: RoundedSelectOption[] = [
  { value: 'normal', label: '普通' },
  { value: 'hd', label: 'HD' },
  { value: 'uhd', label: 'UHD' },
];
export const CANVAS_RIFE_QUALITY_OPTIONS: RoundedSelectOption[] = [
  { value: 'fast', label: '快速' },
  { value: 'standard', label: '标准' },
  { value: 'high', label: '高质量' },
];
export const CANVAS_RIFE_KEEP_AUDIO_OPTIONS: RoundedSelectOption[] = [
  { value: 'yes', label: '保留音频' },
  { value: 'no', label: '静音输出' },
];
export const CANVAS_RIFE_OUTPUT_FORMAT_OPTIONS: RoundedSelectOption[] = [
  { value: 'mp4', label: 'MP4' },
  { value: 'mov', label: 'MOV' },
  { value: 'webm', label: 'WebM' },
];
export const CANVAS_ESRGAN_SCALE_OPTIONS: RoundedSelectOption[] = [
  { value: '2', label: '2× 增强' },
  { value: '4', label: '4× · 较慢' },
];
export const CANVAS_VIDEO_ENHANCEMENT_ENGINE_OPTIONS: RoundedSelectOption[] = [
  { value: 'ai', label: 'AI 清晰增强' },
  { value: 'quick', label: '快速增强' },
];
export const CANVAS_QUICK_ENHANCEMENT_SCALE_OPTIONS: RoundedSelectOption[] = [
  { value: '1', label: '保持分辨率' },
  { value: '2', label: '2× 放大' },
];
export const CANVAS_ESRGAN_MODE_OPTIONS: RoundedSelectOption[] = [
  { value: 'general', label: '通用增强' },
  { value: 'anime', label: '动漫插画' },
];
export const CANVAS_ESRGAN_RESIZE_MODE_OPTIONS: RoundedSelectOption[] = [
  { value: 'upscale', label: '放大并增强' },
  { value: 'keep', label: '保持原尺寸' },
];
export const CANVAS_ESRGAN_IMAGE_FORMAT_OPTIONS: RoundedSelectOption[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
];

const getCanvasAspectRatioLabel = (aspectRatio = CANVAS_AI_DEFAULT_ASPECT_RATIO) => {
  const [rawW, rawH] = String(aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO)
    .split(/[:x×]/i)
    .map(value => Math.round(Number(value)));
  if (!Number.isFinite(rawW) || !Number.isFinite(rawH) || rawW <= 0 || rawH <= 0) {
    return CANVAS_AI_DEFAULT_ASPECT_RATIO;
  }
  let width = Math.abs(rawW);
  let height = Math.abs(rawH);
  while (height) {
    const next = width % height;
    width = height;
    height = next;
  }
  const divisor = width || 1;
  return `${Math.round(rawW / divisor)}:${Math.round(rawH / divisor)}`;
};

const formatCanvasAiResolutionOptionLabel = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!/^\d+\s*[x×]\s*\d+$/i.test(trimmed)) return trimmed;
  return `${trimmed} (${getCanvasAspectRatioLabel(trimmed)})`;
};

const getClosestCanvasAiStandardAspectRatio = (aspectRatio = CANVAS_AI_DEFAULT_ASPECT_RATIO) => {
  const target = parseCanvasAspectRatioValue(aspectRatio);
  return CANVAS_AI_ASPECT_RATIOS.reduce((best, option) => (
    Math.abs(parseCanvasAspectRatioValue(option) - target)
      < Math.abs(parseCanvasAspectRatioValue(best) - target)
      ? option
      : best
  ), CANVAS_AI_DEFAULT_ASPECT_RATIO);
};

export const getCanvasAiAspectRatioOptionsForModel = (model?: string | null): RoundedSelectOption[] => {
  if (isXaisImage2Model(model)) {
    return getXaisImage2RatioOptions(model).map(value => ({
      value,
      label: formatCanvasAiResolutionOptionLabel(value),
    }));
  }
  return CANVAS_AI_ASPECT_RATIO_OPTIONS;
};

export const normalizeCanvasAiAspectRatioForModel = (model?: string | null, aspectRatio?: string | null) => {
  const value = String(aspectRatio || '').trim();
  if (isXaisImage2Model(model)) {
    return resolveXaisImage2Ratio(model, value || CANVAS_AI_DEFAULT_ASPECT_RATIO);
  }
  if (/^\d+\s*[x×]\s*\d+$/i.test(value)) return getClosestCanvasAiStandardAspectRatio(value);
  return CANVAS_AI_ASPECT_RATIOS.includes(value) ? value : CANVAS_AI_DEFAULT_ASPECT_RATIO;
};

export const getCanvasAiDefaultModel = (
  provider: CanvasAiProvider,
  mediaType: 'image' | 'video' = 'image'
) => (
  mediaType === 'video'
    ? provider === 'xais-chat' ? XAIS_CHAT_VIDEO_MODEL_DEFAULT
      : provider === 'mikoto' ? CANVAS_SEEDANCE_2_MODEL
      : ''
    : provider === 'xais-chat'
      ? XAIS_CHAT_IMAGE_MODEL_DEFAULT
    : provider === 'new-api'
          ? NEW_API_IMAGE_MODEL_DEFAULT
        : provider === 'mikoto'
          ? ''
        : OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT
);

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

export const getCanvasAiModelOptions = (
  provider: CanvasAiProvider,
  mediaType: 'image' | 'video' = 'image'
) => (
  mediaType === 'video'
    ? provider === 'xais-chat' ? XAIS_CHAT_VIDEO_MODEL_OPTIONS
      : provider === 'mikoto' ? MIKOTO_VIDEO_MODEL_OPTIONS
      : []
    : provider === 'xais-chat'
      ? XAIS_CHAT_IMAGE_MODEL_OPTIONS
      : provider === 'new-api'
          ? NEW_API_IMAGE_MODEL_OPTIONS
        : provider === 'mikoto'
          ? []
        : OPENAI_COMPATIBLE_IMAGE_MODEL_OPTIONS
);

export const readStoredCanvasAiOpenAiModels = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_OPENAI_MODELS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
  } catch (_) {
    return [];
  }
};

export const readStoredCanvasAiNewApiModels = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_NEW_API_MODELS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
  } catch (_) {
    return [];
  }
};

export const readStoredCanvasAiXaisModels = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_XAIS_MODELS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
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

export const isCanvasAiEndpointEditable = (provider: CanvasAiProvider) => (
  isOpenAiLikeCanvasAiProvider(provider) || provider === 'xais-chat'
);
export const isCanvasAiEndpointVisible = (provider: CanvasAiProvider) => isCanvasAiEndpointEditable(provider);
export const isCanvasAiRemoteModelProvider = (provider: CanvasAiProvider) => (
  isOpenAiLikeCanvasAiProvider(provider) || provider === 'xais-chat'
);
export const getCanvasAiEndpointPlaceholder = (provider: CanvasAiProvider) => (
  provider === 'xais-chat'
    ? XAIS_CHAT_ENDPOINT_DEFAULT
    : provider === 'new-api'
      ? NEW_API_ENDPOINT_PLACEHOLDER
      : provider === 'mikoto'
        ? MIKOTO_ENDPOINT_DEFAULT
      : OPENAI_COMPATIBLE_ENDPOINT_DEFAULT
);

const normalizeCanvasAiXaisEndpoint = (endpoint: string) => {
  const trimmed = (endpoint || XAIS_CHAT_ENDPOINT_DEFAULT).trim().replace(/\/+$/, '');
  return trimmed
    .replace(/\/v1\/(?:models|images\/generations|images\/edits|chat\/completions)$/i, '/v1')
    .replace(/\/models$/i, '');
};

export const getCanvasAiEndpointForRequest = (provider: CanvasAiProvider, endpoint: string) => {
  if (provider === 'xais-chat') {
    const trimmed = endpoint.trim();
    if (!trimmed || /api\.openai\.com|api\.lk888\.ai/i.test(trimmed)) {
      return XAIS_CHAT_ENDPOINT_DEFAULT;
    }
    return normalizeCanvasAiXaisEndpoint(trimmed);
  }
  if (provider === 'new-api') return normalizeNewApiBaseEndpoint(endpoint);
  return isCanvasAiEndpointEditable(provider) ? endpoint : getCanvasAiDefaultEndpoint(provider);
};

export const getCanvasAiEndpointForModels = (provider: CanvasAiProvider, endpoint: string) => {
  if (provider === 'new-api') return normalizeNewApiBaseEndpoint(endpoint);
  if (provider !== 'xais-chat') return endpoint.trim();
  const base = normalizeCanvasAiXaisEndpoint(endpoint);
  return /\/v1$/i.test(base) ? base : `${base}/v1`;
};

export const getCanvasAiXaisUserProfileEndpoint = (endpoint: string) => {
  const base = normalizeCanvasAiXaisEndpoint(endpoint)
    .replace(/\/v1$/i, '')
    .replace(/\/xais(?:\/userProfile)?$/i, '');
  return `${base || XAIS_CHAT_ENDPOINT_DEFAULT}/xais/userProfile`;
};

const CANVAS_AI_XAIS_BALANCE_SCALE = 10000;
export const formatCanvasAiXaisBalance = (balance?: number) => (
  Number.isFinite(balance)
    ? new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format((balance as number) / CANVAS_AI_XAIS_BALANCE_SCALE)
    : '未知'
);

export const isCanvasAiXaisImageModel = (model: string) => {
  const normalized = normalizeXaisImage2Model(model);
  return XAIS_CHAT_IMAGE_MODEL_OPTIONS.some(option => option.value === normalized);
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

export const getStoredCanvasAiProvider = () => {
  const storedProvider = localStorage.getItem(CANVAS_AI_PROVIDER_STORAGE_KEY);
  return normalizeCanvasAiProvider(storedProvider);
};

export const getCanvasAiApiKeyStorageKey = (provider: CanvasAiProvider) => (
  `${CANVAS_AI_API_KEY_STORAGE_PREFIX}${provider}`
);
export const getCanvasAiEndpointStorageKey = (provider: CanvasAiProvider) => (
  `${CANVAS_AI_ENDPOINT_STORAGE_PREFIX}${provider}`
);

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

export const getCanvasAiApiKeyPlaceholder = (provider: CanvasAiProvider) => (
  provider === 'xais-chat'
    ? 'Xais / DCHAI API Key'
    : provider === 'new-api'
      ? 'New API Key'
      : provider === 'mikoto'
        ? 'Mikoto API Key'
      : 'API Key'
);
