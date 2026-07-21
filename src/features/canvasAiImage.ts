import { invoke } from '@tauri-apps/api/core';
import type { AiGatewayKind } from './agentModel';
import type { CanvasAiModelCandidate, NewApiImageProtocol } from './canvasModel';

export type { NewApiImageProtocol } from './canvasModel';

export const OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT = 'gpt-image-1';
export const OPENAI_COMPATIBLE_ENDPOINT_DEFAULT = 'https://api.openai.com/v1';
export const NEW_API_IMAGE_MODEL_DEFAULT = OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT;
export const NEW_API_ENDPOINT_DEFAULT = '';
export const NEW_API_ENDPOINT_PLACEHOLDER = 'https://your-new-api.example.com/v1';
export const XAIS_CHAT_ENDPOINT_DEFAULT = 'https://xais.dchai.cn';
export const XAIS_CHAT_IMAGE_MODEL_DEFAULT = 'Xais Nano Pro_2K';
export const XAIS_CHAT_VIDEO_MODEL_DEFAULT = 'seedance2';
export const NEW_API_GPT_IMAGE_2_MODEL = 'gpt-image-2';
export const NEW_API_NANO_BANANA_PRO_MODEL = 'gemini-3-pro-image';
export const NEW_API_NANO_BANANA_2_MODEL = 'gemini-3.1-flash-image';
export const NEW_API_IMAGE_RESPONSE_FORMAT = 'url';
export const NEW_API_IMAGE_REQUEST_TIMEOUT_SECS = 360;

export const OPENAI_COMPATIBLE_IMAGE_MODEL_OPTIONS = [
  { value: OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT, label: 'gpt-image-1' },
  { value: 'dall-e-3', label: 'DALL-E 3' },
  { value: 'dall-e-2', label: 'DALL-E 2' },
];

export const NEW_API_IMAGE_MODEL_OPTIONS = [
  { value: NEW_API_NANO_BANANA_PRO_MODEL, label: 'Nano Banana Pro' },
  { value: NEW_API_NANO_BANANA_2_MODEL, label: 'Nano Banana 2' },
  { value: NEW_API_GPT_IMAGE_2_MODEL, label: 'GPT Image 2' },
  { value: NEW_API_IMAGE_MODEL_DEFAULT, label: 'gpt-image-1' },
  { value: 'dall-e-3', label: 'DALL-E 3' },
  { value: 'dall-e-2', label: 'DALL-E 2' },
];

export const XAIS_CHAT_IMAGE_MODEL_OPTIONS = [
  { value: XAIS_CHAT_IMAGE_MODEL_DEFAULT, label: 'Nano Banana Pro 2K' },
  { value: 'Xais Nano Pro_4K', label: 'Nano Banana Pro 4K' },
  { value: 'Xais Nano2_2K', label: 'Nano Banana 2 2K' },
  { value: 'Xais Nano2_4K', label: 'Nano Banana 2 4K' },
  { value: 'Xais Nano_Lite_1K', label: 'Nano Banana Lite 1K' },
  { value: 'Xais img2_1k', label: 'Image2 1K' },
  { value: 'Xais Img2_2K', label: 'Image2 2K' },
  { value: 'Xais Img2_4K', label: 'Image2 4K' },
  { value: 'Xais Img2_2K(高画质)', label: 'Img2 2K H' },
  { value: 'Xais Img2_4K(高画质)', label: 'Img2 4K H' },
];

export const XAIS_CHAT_VIDEO_MODEL_OPTIONS = [
  { value: XAIS_CHAT_VIDEO_MODEL_DEFAULT, label: 'seedance2.0(支持真人上传)' },
];

export const CANVAS_AI_PROVIDER_OPTIONS = [
  { value: 'xais-chat', label: 'Xais / DCHAI 中转' },
  { value: 'new-api', label: 'New API 中转' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
  { value: 'custom', label: '自定义 Gateway' },
] as const;

export const CANVAS_AI_VIDEO_PROVIDER_OPTIONS = [
  { value: 'xais-chat', label: 'Xais / DCHAI 中转' },
  { value: 'new-api', label: 'New API 中转' },
] as const;

export type CanvasAiImageProvider = typeof CANVAS_AI_PROVIDER_OPTIONS[number]['value'];

export const resolveCanvasAiReferenceProvider = (
  runtimeProvider: CanvasAiImageProvider | null | undefined,
  nodeProvider: CanvasAiImageProvider | null | undefined,
  fallbackProvider: CanvasAiImageProvider,
) => runtimeProvider || nodeProvider || fallbackProvider;

export const mergeCanvasAiReferenceSourceItems = <T extends { id: string }>(
  currentItems: T[],
  runtimeItems: T[],
) => {
  const itemsById = new Map(currentItems.map(item => [item.id, item]));
  runtimeItems.forEach(item => itemsById.set(item.id, item));
  return Array.from(itemsById.values());
};

export type NewApiImageModelFamily = 'nano-banana-pro' | 'nano-banana-2' | 'nano-banana-lite';
export type CanvasAiImageResolution = '1k' | '2k' | '4k';

const toImageModelToken = (model?: string | null) => (
  String(model || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
);

export const getNewApiImageModelFamily = (model?: string | null): NewApiImageModelFamily | null => {
  const token = toImageModelToken(model).replace(/preview/g, '');
  const geminiIndex = token.indexOf('gemini');
  if (geminiIndex < 0) return null;
  if (token.includes('lite') && token.includes('image')) return 'nano-banana-lite';
  const signature = token.slice(geminiIndex + 'gemini'.length);
  const isGemini3 = /^3/.test(signature) || /^image3/.test(signature);
  if (!isGemini3) return null;
  if (signature.includes('flash')) return 'nano-banana-2';
  if (signature.includes('pro')) return 'nano-banana-pro';
  return null;
};

export const getNewApiImageModelDisplayName = (model?: string | null) => {
  const value = String(model || '').trim();
  const family = getNewApiImageModelFamily(value);
  if (family === 'nano-banana-pro') return 'Nano Banana Pro';
  if (family === 'nano-banana-2') return 'Nano Banana 2';
  if (family === 'nano-banana-lite') return 'Nano Banana Lite 1K';
  if (toImageModelToken(value).includes('gptimage2')) return 'GPT Image 2';
  return value;
};

export const getDefaultNewApiImageProtocol = (
  _model?: string | null,
  _hasInputImages = false,
): NewApiImageProtocol => 'chat_completions';

export const isGptImage2LikeModel = (model?: string | null) => (
  toImageModelToken(model).includes('gptimage2')
);

const supportsNewApiImageFamilyResolution = (model?: string | null) => {
  const family = getNewApiImageModelFamily(model);
  return family === 'nano-banana-pro' || family === 'nano-banana-2';
};

export const isLikelyNewApiVideoModel = (model?: string | null) => {
  const normalized = String(model || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return /(?:^|-)(video|sora|veo|seedance|kling|hailuo|minimax|runway|luma|pixverse|vidu|jimeng)(?:$|-|\d)/.test(normalized)
    || /(?:image2video|text2video|i2v|t2v|wan\d.*video|video.*wan\d)/.test(normalized);
};

export const normalizeCanvasAiImageResolution = (resolution?: string | null): CanvasAiImageResolution => (
  String(resolution || '').trim().toLowerCase() === '1k'
    ? '1k'
    : String(resolution || '').trim().toLowerCase() === '4k' ? '4k' : '2k'
);

export const supportsCanvasAiImageResolution = (
  provider?: string | null,
  model?: string | null,
) => {
  const family = getCanvasAiImageModelFamily(provider, model);
  return family === 'nano-banana-pro'
    || family === 'nano-banana-2'
    || family === 'gpt-image-2'
    || family === 'gpt-image-2-h';
};

export const isOpenAiLikeCanvasAiProvider = (provider?: string | null) => (
  provider === 'openai-compatible' || provider === 'new-api' || provider === 'custom'
);

export type CanvasAiBaseImageOptions = {
  apiKey: string;
  cloudWallet?: boolean;
  providerChannelId?: string;
  providerCandidates?: CanvasAiModelCandidate[];
  providerRuntime?: Record<string, {
    apiKey?: string;
    endpoint?: string;
    headers?: Record<string, string>;
    apiProvider?: string;
    gatewayKind?: AiGatewayKind;
    licenseManaged?: boolean;
  }>;
  gatewayKind?: AiGatewayKind;
  apiProvider?: string;
  licenseManaged?: boolean;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  inputImages?: string[];
  prepareInputImagesForCandidate?: (candidate: CanvasAiModelCandidate) => Promise<string[]>;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  count?: number;
  headers?: Record<string, string>;
};

type CloudImageGenerationResult = {
  images: string[];
  provider: string;
  model: string;
  chargedCredits: string;
};

type CloudVideoGenerationResult = {
  results: unknown[];
  provider: string;
  model: string;
  chargedCredits: string;
};

const generateCloudWalletImages = async (options: CanvasAiImageOptions) => {
  const clientRequestId = options.clientRequestId?.trim()
    || `canvas-image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const result = await invoke<CloudImageGenerationResult>('generate_cloud_images', {
      request: {
        clientRequestId,
        provider: options.provider,
        providerChannelId: options.providerChannelId?.trim() || undefined,
        model: String(options.model || '').trim(),
        prompt: options.prompt.trim(),
        negativePrompt: options.negativePrompt?.trim() || undefined,
        inputImages: (options.inputImages || []).filter(Boolean).slice(0, 8),
        aspectRatio: normalizeImageAspectRatio(options.aspectRatio),
        resolution: options.resolution?.trim() || undefined,
        outputFormat: normalizeOutputFormat(options.outputFormat),
        count: Math.max(1, Math.min(4, Math.round(options.count || 1))),
      },
    });
    const images = Array.from(new Set(result.images.map(value => value.trim()).filter(Boolean)));
    if (images.length === 0) throw new Error('授权钱包渠道没有返回图片数据');
    return images;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const generateCloudWalletVideos = async (options: CanvasAiVideoOptions) => {
  const clientRequestId = options.clientRequestId?.trim()
    || `canvas-video-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const provider = options.provider === 'xais-chat' ? 'xais-chat' : 'new-api';
  const requestCount = Math.max(1, Math.min(4, Math.round(options.count || 1)));
  try {
    const result = await invoke<CloudVideoGenerationResult>('generate_cloud_videos', {
      request: {
        clientRequestId,
        provider,
        providerChannelId: options.providerChannelId?.trim() || undefined,
        model: String(options.model || '').trim(),
        prompt: options.prompt.trim(),
        inputImages: (options.inputImages || []).filter(Boolean).slice(0, provider === 'xais-chat' ? 13 : 8),
        aspectRatio: String(options.aspectRatio || '16:9'),
        resolution: options.resolution?.trim() || undefined,
        duration: options.duration,
        inputMode: options.inputMode,
        count: requestCount,
      },
    });
    const output: string[] = [];
    const taskIds: string[] = [];
    for (const item of result.results || []) {
      output.push(...collectVideoStrings(item));
      const taskId = getTaskIdFromResponse(item);
      if (taskId) taskIds.push(taskId);
    }
    if (output.length >= requestCount) return Array.from(new Set(output)).slice(0, requestCount);
    if (taskIds.length === 0) throw new Error('云端视频渠道没有返回任务 ID 或视频地址');
    const deadline = Date.now() + 25 * 60 * 1000;
    for (const taskId of Array.from(new Set(taskIds))) {
      let lastStatus: unknown = null;
      while (Date.now() < deadline) {
        await delay(2500);
        lastStatus = await invoke<unknown>('get_cloud_video_status', {
          taskId,
          provider,
          clientRequestId,
          providerChannelId: options.providerChannelId?.trim() || undefined,
        });
        output.push(...collectVideoStrings(lastStatus));
        if (output.length >= requestCount) return Array.from(new Set(output)).slice(0, requestCount);
        const state = getNewApiVideoTaskState(lastStatus);
        if (/^(?:failed|failure|error|cancelled|canceled)$/.test(state)) {
          throw new Error(getNewApiVideoFailureMessage(lastStatus) || `云端视频任务失败：${taskId}`);
        }
      }
      const failure = getNewApiVideoFailureMessage(lastStatus);
      if (failure) throw new Error(failure);
    }
    if (output.length === 0) throw new Error('云端视频任务超时或没有返回视频地址');
    return Array.from(new Set(output)).slice(0, requestCount);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export type CanvasAiVideoInputMode = 'REF' | 'FLF';

export type CanvasAiImageOptions = CanvasAiBaseImageOptions & {
  provider: CanvasAiImageProvider;
  endpoint?: string;
  imageProtocol?: NewApiImageProtocol;
  clientRequestId?: string;
  endpointProtocol?: NewApiImageProtocol;
  referenceHost?: string;
  referenceReadyDurationMs?: number;
  isFirstRequest?: boolean;
  singleAttempt?: boolean;
  timeoutSecs?: number;
};

export type CanvasAiVideoOptions = CanvasAiImageOptions & {
  duration?: number;
  inputMode?: CanvasAiVideoInputMode;
};

const getErrorMessage = (error: unknown) => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    const value = error as {
      message?: string;
      msg?: string;
      detail?: string;
      error?: string | { message?: string; detail?: string; code?: string | number };
      error_description?: string;
    };
    if (typeof value.error === 'string') return value.error;
    return value.message
      || value.msg
      || value.error?.message
      || value.error?.detail
      || value.error_description
      || value.detail
      || JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
};

const isUnauthorizedError = (error: unknown) => /(?:HTTP\s*)?401|unauthorized|invalid api key|invalid token/i.test(getErrorMessage(error));
const isRetryableServerError = (error: unknown) => /HTTP\s*5\d\d|internal server error|bad gateway|service unavailable|gateway timeout|connection|error sending request|timed?\s*out|timeout|network|dns|reset|closed|连接|超时|断开/i.test(getErrorMessage(error));

export const isNewApiImageProtocolUnsupportedError = (error: unknown) => {
  const message = getErrorMessage(error);
  return /(?:HTTP|status(?:\s+code)?)[^\d]{0,8}(?:404|405|501)\b/i.test(message)
    || /(?:method not allowed|no route matched|cannot\s+post|unsupported endpoint|endpoint not (?:found|supported)|route not found|not implemented)/i.test(message)
    || /(?:路由|接口|端点).{0,24}(?:不存在|未找到|不支持|未实现)|(?:不存在|未找到|不支持|未实现).{0,24}(?:路由|接口|端点)/i.test(message);
};

const getNewApiImageHttpStatus = (error: unknown) => {
  const match = getErrorMessage(error).match(/(?:HTTP|status(?:\s+code)?)[^\d]{0,8}(\d{3})\b/i);
  return match ? Number(match[1]) : null;
};

const newApiImageProtocolLabel = (protocol: NewApiImageProtocol) => {
  if (protocol === 'chat_completions') return 'chat/completions';
  if (protocol === 'images_edits') return 'images/edits';
  if (protocol === 'images_generations') return 'images/generations';
  return 'async task';
};

export const formatNewApiImageProtocolError = (
  protocol: NewApiImageProtocol,
  error: unknown,
) => {
  const message = getErrorMessage(error);
  const status = getNewApiImageHttpStatus(error);
  const label = newApiImageProtocolLabel(protocol);
  if (status && [500, 502, 503, 504].includes(status)) {
    return `上游渠道暂时不可用（${label}，HTTP ${status}），请稍后手动重试。`;
  }
  if (isNewApiImageProtocolUnsupportedError(error)) {
    return `当前模型的 ${label} 协议可能配置错误，请切换正确协议后手动重试。`;
  }
  if (/timed?\s*out|timeout|超时/i.test(message)) {
    return `NewAPI ${label} 请求等待超时；上游可能仍在继续生成，请先到中转后台确认后再手动重试。`;
  }
  return `NewAPI ${label} 请求失败：${message}`;
};

export type NewApiReferenceReadiness = {
  readyDurationMs: number;
  referenceHosts: string[];
};

type NewApiImageProtocolExecutor<T> = {
  ensureReferencesReady: (urls: string[]) => Promise<NewApiReferenceReadiness>;
  chatCompletions: (readiness: NewApiReferenceReadiness) => Promise<T>;
  imagesEdits: (readiness: NewApiReferenceReadiness) => Promise<T>;
  imagesGenerations: (readiness: NewApiReferenceReadiness) => Promise<T>;
  asyncTask?: (readiness: NewApiReferenceReadiness) => Promise<T>;
};

export const executeNewApiImageProtocol = async <T>(
  protocol: NewApiImageProtocol,
  cloudflareReferenceUrls: string[],
  executor: NewApiImageProtocolExecutor<T>,
) => {
  const readiness = cloudflareReferenceUrls.length > 0
    ? await executor.ensureReferencesReady(cloudflareReferenceUrls)
    : { readyDurationMs: 0, referenceHosts: [] };
  if (protocol === 'chat_completions') return executor.chatCompletions(readiness);
  if (protocol === 'images_edits') return executor.imagesEdits(readiness);
  if (protocol === 'images_generations') return executor.imagesGenerations(readiness);
  if (executor.asyncTask) return executor.asyncTask(readiness);
  throw new Error('NewAPI 图片异步任务协议尚未配置提交端点。');
};

const isRemoteHttpImageSource = (source?: string | null) => (
  /^https?:\/\//i.test(String(source || '').trim()) && !/asset\.localhost|localhost|127\.0\.0\.1/i.test(String(source || ''))
);

const isXaisAttachmentImageRef = (source?: string | null) => {
  const value = String(source || '').trim();
  return value.length > 0
    && value.length <= 512
    && !/^(?:https?:|data:|asset:|file:)/i.test(value)
    && !/^[a-zA-Z]:[\\/]/.test(value)
    && !/^\\\\/.test(value)
    && /^[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp)$/i.test(value);
};

const buildPromptWithOptions = (prompt: string, aspectRatio?: string, resolution?: string) => {
  const constraints = [
    aspectRatio ? `must output exactly ${aspectRatio} aspect ratio` : '',
    resolution ? `target resolution ${resolution}` : '',
  ].filter(Boolean);
  if (constraints.length === 0) return prompt.trim();
  return `${prompt.trim()}\n\nStrict image constraints: ${constraints.join(', ')}. Do not crop or pad to a different aspect ratio.`;
};

const normalizeNegativePrompt = (_value?: string | null) => '';

const buildChinesePromptWithOptions = (prompt: string, aspectRatio?: string, resolution?: string) => {
  const constraints = [
    aspectRatio ? `图片长宽比:${aspectRatio}` : '',
    resolution ? `输出清晰度:${resolution}` : '',
  ].filter(Boolean);
  if (constraints.length === 0) return prompt.trim();
  return `${prompt.trim()}\n${constraints.join('，')}`;
};

const normalizeOutputFormat = (format?: string | null) => (
  String(format || '').trim().toLowerCase() === 'png' ? 'png' : 'jpg'
);

const outputMimeFromFormat = (format?: string | null) => (
  normalizeOutputFormat(format) === 'png' ? 'image/png' : 'image/jpeg'
);

const normalizeOpenAiEndpoint = (endpoint: string, path: 'images/generations' | 'images/edits') => {
  const trimmed = (endpoint || OPENAI_COMPATIBLE_ENDPOINT_DEFAULT).trim().replace(/\/+$/, '');
  if (/\/(?:images\/generations|images\/edits)$/i.test(trimmed)) return trimmed;
  return `${trimmed}/${path}`;
};

export const normalizeNewApiBaseEndpoint = (endpoint: string) => {
  let trimmed = String(endpoint || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  trimmed = trimmed
    .replace(/\/v1\/(?:models|images\/generations|images\/edits|chat\/completions|video\/generations)(?:\/[^/]+)?$/i, '/v1')
    .replace(/\/(?:models|images\/generations|images\/edits|chat\/completions|video\/generations)(?:\/[^/]+)?$/i, '')
    .replace(/\/+$/, '');
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
};

const normalizeNewApiEndpoint = (
  endpoint: string,
  path: 'images/generations' | 'images/edits' | 'chat/completions' | 'video/generations'
) => {
  const base = normalizeNewApiBaseEndpoint(endpoint);
  if (!base) throw new Error('Please enter New API Base URL first, for example https://your-new-api.example.com/v1');
  return `${base}/${path}`;
};

const normalizeChatCompletionsEndpoint = (endpoint: string) => {
  const trimmed = (endpoint || XAIS_CHAT_ENDPOINT_DEFAULT).trim().replace(/\/+$/, '');
  if (/\/v1\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
};

const normalizeImageGenerationsEndpoint = (endpoint: string) => {
  const trimmed = (endpoint || XAIS_CHAT_ENDPOINT_DEFAULT).trim().replace(/\/+$/, '');
  if (/\/v1\/images\/generations$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/images/generations`;
  return `${trimmed}/v1/images/generations`;
};

const normalizeXaisWorkerEndpoint = (endpoint: string) => {
  const fallback = `${XAIS_CHAT_ENDPOINT_DEFAULT}/xais`;
  let trimmed = (endpoint || fallback).trim().replace(/\/+$/, '');
  if (!trimmed) return fallback;
  trimmed = trimmed
    .replace(/\/v1\/(?:models|images\/generations|images\/edits|chat\/completions)$/i, '')
    .replace(/\/workerTask(?:Start|Wait)$/i, '')
    .replace(/\/attUrls$/i, '')
    .replace(/\/v1$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/+$/, '');
  if (/\/xais$/i.test(trimmed)) return trimmed;
  if (/(?:xais|sg2c?)\.dchai\.cn$/i.test(trimmed)) return `${trimmed}/xais`;
  return trimmed;
};

type CanvasAiRequestContext = Pick<
  CanvasAiImageOptions,
  | 'provider'
  | 'gatewayKind'
  | 'apiProvider'
  | 'model'
  | 'headers'
  | 'clientRequestId'
  | 'endpointProtocol'
  | 'referenceHost'
  | 'referenceReadyDurationMs'
  | 'isFirstRequest'
  | 'singleAttempt'
  | 'timeoutSecs'
>;

const requestProfileArgs = (context?: CanvasAiRequestContext) => ({
  gatewayKind: context?.gatewayKind,
  provider: context?.apiProvider || context?.provider,
  model: context?.model,
  headers: context?.headers,
  clientRequestId: context?.clientRequestId,
  endpointProtocol: context?.endpointProtocol,
  referenceHost: context?.referenceHost,
  referenceReadyDurationMs: context?.referenceReadyDurationMs,
  isFirstRequest: context?.isFirstRequest,
  singleAttempt: context?.singleAttempt,
  timeoutSecs: context?.timeoutSecs,
});

const postJsonViaTauri = async (
  url: string,
  apiKey: string,
  body: unknown,
  context?: CanvasAiRequestContext,
) => {
  try {
    return await invoke<unknown>('post_ai_json', {
      url,
      apiKey,
      body,
      ...requestProfileArgs(context),
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const postTextViaTauri = async (
  url: string,
  apiKey: string,
  body: unknown,
  context?: CanvasAiRequestContext,
) => {
  try {
    return await invoke<string>('post_ai_text', {
      url,
      apiKey,
      body,
      ...requestProfileArgs(context),
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const postImageEditViaTauri = async (
  url: string,
  apiKey: string,
  payload: {
    model: string;
    prompt: string;
    n: number;
    size: string;
    quality?: string;
    responseFormat?: string;
    images: string[];
  },
  context?: CanvasAiRequestContext,
) => {
  try {
    return await invoke<unknown>('post_ai_image_edit', {
      url,
      apiKey,
      ...payload,
      ...requestProfileArgs(context),
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const getJsonViaTauri = async (url: string, apiKey: string, context?: CanvasAiRequestContext) => {
  try {
    return await invoke<unknown>('get_ai_json', {
      url,
      apiKey,
      ...requestProfileArgs(context),
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const getTextViaTauri = async (url: string, apiKey: string, context?: CanvasAiRequestContext) => {
  try {
    return await invoke<string>('get_ai_text', {
      url,
      apiKey,
      ...requestProfileArgs(context),
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const imageSizeFromAspectRatio = (aspectRatio?: string) => {
  switch (aspectRatio) {
    case '9:16': return '1024x1792';
    case '16:9': return '1792x1024';
    case '3:4': return '1024x1536';
    case '4:3': return '1536x1024';
    default: return '1024x1024';
  }
};

const getRemoteReferenceHosts = (sources: string[]) => Array.from(new Set(sources.flatMap(source => {
  try {
    const parsed = new URL(source);
    return /^https?:$/.test(parsed.protocol) && parsed.hostname ? [parsed.hostname.toLowerCase()] : [];
  } catch (_) {
    return [];
  }
})));

const getCloudflareReferenceUrls = (sources: string[]) => sources.filter(source => {
  try {
    return new URL(source).hostname.toLowerCase().endsWith('.trycloudflare.com');
  } catch (_) {
    return false;
  }
});

const ensureNewApiReferenceUrlsReady = async (urls: string[]): Promise<NewApiReferenceReadiness> => {
  try {
    return await invoke<NewApiReferenceReadiness>('check_newapi_reference_urls_ready', {
      urls,
      maxWaitMs: 5000,
    });
  } catch (error) {
    throw new Error(`Cloudflare 参考图尚未就绪，未提交生图任务：${getErrorMessage(error)}`);
  }
};

const normalizeImageAspectRatio = (aspectRatio?: string | null) => {
  const value = String(aspectRatio || '').trim();
  return ['1:1', '3:4', '4:3', '9:16', '16:9'].includes(value) ? value : '1:1';
};

export const gptImage2SizeFromAspectRatio = (aspectRatio?: string, resolution?: string) => {
  const isHighResolution = normalizeCanvasAiImageResolution(resolution) === '4k';
  switch (normalizeImageAspectRatio(aspectRatio)) {
    case '9:16': return isHighResolution ? '2160x3840' : '1088x1920';
    case '16:9': return isHighResolution ? '3840x2160' : '1920x1088';
    case '3:4': return isHighResolution ? '2400x3200' : '960x1280';
    case '4:3': return isHighResolution ? '3200x2400' : '1280x960';
    default: return isHighResolution ? '2880x2880' : '1024x1024';
  }
};

const newApiSizeFromAspectRatio = (model?: string | null, aspectRatio?: string, resolution?: string) => (
  isGptImage2LikeModel(model) || supportsNewApiImageFamilyResolution(model)
    ? gptImage2SizeFromAspectRatio(normalizeImageAspectRatio(aspectRatio), resolution)
    : imageSizeFromAspectRatio(normalizeImageAspectRatio(aspectRatio))
);

export const newApiImageRequestParams = (
  model: string,
  count: number,
  aspectRatio?: string,
  resolution?: string
) => {
  const ratio = normalizeImageAspectRatio(aspectRatio);
  const size = newApiSizeFromAspectRatio(model, ratio, resolution);
  const supportsResolution = isGptImage2LikeModel(model) || supportsNewApiImageFamilyResolution(model);
  return {
    n: count,
    size,
    aspect_ratio: ratio,
    ratio,
    ...(supportsResolution ? {
      quality: normalizeCanvasAiImageResolution(resolution) === '4k' ? 'high' : 'standard',
    } : {}),
  };
};

const normalizeNewApiVideoResolution = (resolution?: string | null) => {
  const value = String(resolution || '').trim().toLowerCase();
  return value === '480p' || value === '1080p' ? value : '720p';
};

export const getNewApiVideoDimensions = (aspectRatio?: string, resolution?: string) => {
  const ratio = normalizeImageAspectRatio(aspectRatio);
  const shortEdge = normalizeNewApiVideoResolution(resolution) === '1080p'
    ? 1080
    : normalizeNewApiVideoResolution(resolution) === '480p' ? 480 : 720;
  switch (ratio) {
    case '16:9': return { width: shortEdge === 480 ? 854 : Math.round(shortEdge * 16 / 9), height: shortEdge };
    case '9:16': return { width: shortEdge, height: shortEdge === 480 ? 854 : Math.round(shortEdge * 16 / 9) };
    case '4:3': return { width: Math.round(shortEdge * 4 / 3), height: shortEdge };
    case '3:4': return { width: shortEdge, height: Math.round(shortEdge * 4 / 3) };
    default: return { width: shortEdge, height: shortEdge };
  }
};

export const newApiVideoRequestParams = (options: {
  model: string;
  prompt: string;
  inputImages?: string[];
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  inputMode?: CanvasAiVideoInputMode;
  count?: number;
}) => {
  const inputImages = (options.inputImages || []).filter(Boolean).slice(0, 8);
  const aspectRatio = normalizeImageAspectRatio(options.aspectRatio);
  const resolution = normalizeNewApiVideoResolution(options.resolution);
  const inputMode = options.inputMode === 'FLF' ? 'FLF' : 'REF';
  const dimensions = getNewApiVideoDimensions(aspectRatio, resolution);
  const durationValue = Number(options.duration);
  const duration = Number.isFinite(durationValue) ? Math.max(1, Math.min(60, durationValue)) : 5;
  return {
    model: options.model.trim(),
    prompt: options.prompt.trim(),
    ...(inputImages[0] ? { image: inputImages[0] } : {}),
    duration,
    ...dimensions,
    n: Math.max(1, Math.min(4, Math.round(options.count || 1))),
    response_format: 'url',
    metadata: {
      aspect_ratio: aspectRatio,
      resolution,
      input_mode: inputMode,
      ...(inputMode === 'FLF' && inputImages[1] ? { end_image: inputImages[1] } : {}),
      ...(inputImages.length > 1 ? { reference_images: inputImages } : {}),
    },
  };
};

const XAIS_NANO_RATIO_OPTIONS = ['1:1', '16:9', '9:16', '3:2', '2:3', '4:3', '21:9', '3:4', '1:4', '4:1', '1:8', '8:1'];

export const XAIS_IMAGE2_RATIO_OPTIONS_BY_MODEL: Record<string, string[]> = {
  'Xais Nano Pro_2K': XAIS_NANO_RATIO_OPTIONS,
  'Xais Nano Pro_4K': XAIS_NANO_RATIO_OPTIONS,
  'Xais Nano2_2K': XAIS_NANO_RATIO_OPTIONS,
  'Xais Nano2_4K': XAIS_NANO_RATIO_OPTIONS,
  'Xais Nano_Lite_1K': XAIS_NANO_RATIO_OPTIONS,
  'Xais Nano Pro_4K_png': XAIS_NANO_RATIO_OPTIONS,
  'Xais Nano2_4K_png': XAIS_NANO_RATIO_OPTIONS,
  'Xais img2_1k': ['1:1', '9:16', '4:3', '3:4', '5:4'],
  'Xais Img2_2K': [
    '2048x2048',
    '2048x1152',
    '1152x2048',
    '2064x1376',
    '1376x2064',
    '2048x1536',
    '1536x2048',
    '2016x864',
    '864x2016',
    '2080x1664',
    '1664x2080',
    '2048x1024',
    '2064x688',
  ],
  'Xais Img2_4K': [
    '2880x2880',
    '3840x2160',
    '2160x3840',
    '3520x2352',
    '2352x3520',
    '3312x2480',
    '2480x3312',
    '3840x1648',
    '1648x3840',
    '3216x2576',
    '2576x3216',
    '3840x1920',
    '3840x1280',
    '1280x3840',
  ],
  'Xais Img2_2K(高画质)': [
    '2048x2048',
    '2048x1152',
    '1152x2048',
    '2064x1376',
    '1376x2064',
    '2048x1536',
    '1536x2048',
    '2016x864',
    '864x2016',
    '2080x1664',
    '1664x2080',
    '2048x1024',
    '2064x688',
  ],
  'Xais Img2_4K(高画质)': [
    '2880x2880',
    '3840x2160',
    '2160x3840',
    '3520x2352',
    '2352x3520',
    '3312x2480',
    '2480x3312',
    '3840x1648',
    '1648x3840',
    '3216x2576',
    '2576x3216',
    '3840x1920',
    '3840x1280',
    '1280x3840',
  ],
};

const toXaisModelToken = (value?: string | null) => (
  String(value || '').trim().replace(/[^a-z0-9]+/gi, '').toLowerCase()
);

const findXaisImageModelOption = (model?: string | null) => {
  const trimmed = String(model || '').trim();
  if (!trimmed) return null;
  const exactOption = XAIS_CHAT_IMAGE_MODEL_OPTIONS.find(option => (
    option.value === trimmed || option.label === trimmed
  ));
  if (exactOption) return exactOption;
  const token = toXaisModelToken(trimmed);
  return XAIS_CHAT_IMAGE_MODEL_OPTIONS.find(option => (
    toXaisModelToken(option.value) === token
    || toXaisModelToken(option.label) === token
  )) || null;
};

const getXaisImageModelValueByLabelToken = (token: string) => (
  XAIS_CHAT_IMAGE_MODEL_OPTIONS.find(option => toXaisModelToken(option.label) === token)?.value || ''
);

export const normalizeXaisImage2Model = (model?: string | null) => {
  const trimmed = String(model || '').trim();
  if (!trimmed) return trimmed;
  const compact = trimmed.replace(/[\s_-]+/g, '_');
  const token = toXaisModelToken(trimmed);
  const option = findXaisImageModelOption(trimmed);
  if (option) return option.value;
  if (/^c3f$/i.test(trimmed)) return XAIS_CHAT_IMAGE_MODEL_DEFAULT;
  if (/^(?:xais)?nanobananapro4k(?:png|5)$/i.test(token) || /^xaisnanopro4kpng$/i.test(token) || /^nano_banana_pro_4k_5$/i.test(compact)) return 'Xais Nano Pro_4K_png';
  if (/^(?:xais)?nanobanana24k(?:png|5)$/i.test(token) || /^xaisnano24kpng$/i.test(token) || /^nano_banana_2_4k_5$/i.test(compact)) return 'Xais Nano2_4K_png';
  if (/^(?:xais)?nanobananapro2k0?$/i.test(token) || /^xaisnanopro2k$/i.test(token) || /^nano_banana_pro_2k(?:_0)?$/i.test(compact)) return 'Xais Nano Pro_2K';
  if (/^(?:xais)?nanobananapro4k0?$/i.test(token) || /^xaisnanopro4k$/i.test(token) || /^nano_banana_pro_4k(?:_0)?$/i.test(compact)) return 'Xais Nano Pro_4K';
  if (/^(?:xais)?nanobanana22k0?$/i.test(token) || /^xaisnano22k$/i.test(token) || /^nano_banana_2_2k(?:_0)?$/i.test(compact)) return 'Xais Nano2_2K';
  if (/^(?:xais)?nanobanana24k0?$/i.test(token) || /^xaisnano24k$/i.test(token) || /^nano_banana_2_4k(?:_0)?$/i.test(compact)) return 'Xais Nano2_4K';
  if (/^(?:xais)?nanobananalite(?:1k)?0?$/i.test(token) || /^xaisnanolite1k$/i.test(token) || /^nano_banana_lite_1k(?:_0)?$/i.test(compact)) return 'Xais Nano_Lite_1K';
  if (/^(?:xais)?(?:img2|image2)4k(?:h|hq|high|highquality)$/i.test(token) || /^xais_img2_4k_h$/i.test(compact)) {
    return getXaisImageModelValueByLabelToken('img24kh') || trimmed;
  }
  if (/^(?:xais)?(?:img2|image2)2k(?:h|hq|high|highquality)$/i.test(token) || /^xais_img2_2k_h$/i.test(compact)) {
    return getXaisImageModelValueByLabelToken('img22kh') || trimmed;
  }
  if (/^(?:xais)?(?:img2|image2)4k$/i.test(token) || /^xais_img2_4k$/i.test(compact)) return 'Xais Img2_4K';
  if (/^(?:xais)?(?:img2|image2)2k$/i.test(token) || /^xais_img2_2k$/i.test(compact)) return 'Xais Img2_2K';
  if (/^(?:xais)?(?:img2|image2)1k$/i.test(token) || /^xais_img2_1k$/i.test(compact)) return 'Xais img2_1k';
  return trimmed;
};

export const XAIS_IMAGE_REQUEST_MODEL_BY_UI_MODEL: Record<string, string> = {
  'Xais Nano Pro_2K': 'Nano_Banana_Pro_2K_0',
  'Xais Nano Pro_4K': 'Nano_Banana_Pro_4K_0',
  'Xais Nano2_2K': 'Nano_Banana_2_2K_0',
  'Xais Nano2_4K': 'Nano_Banana_2_4K_0',
  'Xais Nano_Lite_1K': 'Xais_Nano_Lite_1K',
  'Xais Nano Pro_4K_png': 'Nano_Banana_Pro_4K_5',
  'Xais Nano2_4K_png': 'Nano_Banana_2_4K_5',
  'Xais img2_1k': 'Image2_1K',
  'Xais Img2_2K': 'Image2_2K',
  'Xais Img2_4K': 'Image2_4K',
  'Xais Img2_2K(高画质)': 'Xais_Img2_2K_H',
  'Xais Img2_4K(高画质)': 'Xais_Img2_4K_H',
};

export const resolveXaisImageRequestModel = (model?: string | null) => {
  const normalized = normalizeXaisImage2Model(model || XAIS_CHAT_IMAGE_MODEL_DEFAULT);
  return XAIS_IMAGE_REQUEST_MODEL_BY_UI_MODEL[normalized] || normalized || XAIS_CHAT_IMAGE_MODEL_DEFAULT;
};

export type CanvasAiImageModelFamily =
  | 'nano-banana-pro'
  | 'nano-banana-2'
  | 'nano-banana-lite'
  | 'gpt-image-2'
  | 'gpt-image-2-h';

const xaisModelTokens = (model?: string | null) => ({
  raw: toXaisModelToken(model),
  request: toXaisModelToken(resolveXaisImageRequestModel(model)),
});

export const getCanvasAiImageModelFamily = (
  provider?: string | null,
  model?: string | null,
): CanvasAiImageModelFamily | null => {
  if (provider === 'new-api') {
    const newApiFamily = getNewApiImageModelFamily(model);
    if (newApiFamily) return newApiFamily;
    const token = toImageModelToken(model);
    if (token.includes('nanobananapro')) return 'nano-banana-pro';
    if (token.includes('nanobanana2')) return 'nano-banana-2';
    if (token.includes('nanobananalite')) return 'nano-banana-lite';
  }
  if (isGptImage2LikeModel(model)) return 'gpt-image-2';
  if (provider !== 'xais-chat') return null;

  const { raw, request } = xaisModelTokens(model);
  const combined = `${raw}|${request}`;
  const isImage2High = /(?:img2|image2)(?:2k|4k)(?:h|hq|high|highquality)(?:$|\|)/i.test(combined)
    || /xais(?:img2|image2)(?:2k|4k)h/i.test(combined);
  if (isImage2High) return 'gpt-image-2-h';
  if (/(?:img2|image2)(?:1k|2k|4k)/i.test(combined)) return 'gpt-image-2';
  if (/(?:nanobananapro|bananapro|nanopro)/i.test(combined)) return 'nano-banana-pro';
  if (/(?:nanobanana2|banana2|nano2)/i.test(combined)) return 'nano-banana-2';
  if (/(?:nanobananalite|bananalite|nanolite)/i.test(combined)) return 'nano-banana-lite';
  return null;
};

export const getCanvasAiPublicImageModelPriority = (
  provider?: string | null,
  model?: string | null,
) => {
  const family = getCanvasAiImageModelFamily(provider, model);
  if (family === 'nano-banana-pro') return 0;
  if (family === 'nano-banana-2') return 1;
  if (family === 'nano-banana-lite') return 2;
  if (family === 'gpt-image-2') return 3;
  if (family === 'gpt-image-2-h') return 4;
  return 99;
};

export const shouldUseCanvasAiNativeImageBatchRequest = (
  provider: CanvasAiImageProvider,
  cloudWallet: boolean,
  requestedCount: number,
) => requestedCount <= 1 && (provider === 'new-api' || cloudWallet);

export const getCanvasAiSlotClientRequestId = (
  clientRequestId: string,
  slotIndex: number,
  requestedCount: number,
) => requestedCount > 1
  ? `${clientRequestId}:slot:${slotIndex + 1}`
  : clientRequestId;

const imageFamilyLabel = (family: CanvasAiImageModelFamily) => {
  if (family === 'nano-banana-pro') return 'Nano Banana Pro';
  if (family === 'nano-banana-2') return 'Nano Banana 2';
  if (family === 'nano-banana-lite') return 'Nano Banana Lite 1K';
  if (family === 'gpt-image-2-h') return 'GPT Image 2 H';
  return 'GPT Image 2';
};

export const getCanvasAiPublicImageModelName = (
  provider?: string | null,
  model?: string | null,
) => {
  const family = getCanvasAiImageModelFamily(provider, model);
  return family ? imageFamilyLabel(family) : null;
};

export const isHiddenCanvasAiImageModel = (provider?: string | null, model?: string | null) => {
  if (provider !== 'xais-chat') return false;
  const { raw, request } = xaisModelTokens(model);
  return raw.includes('png') || /nanobanana(?:pro|2)4k5$/i.test(request);
};

export const isCanvasAiPublicImageModel = (
  provider?: string | null,
  model?: string | null,
) => Boolean(
  getCanvasAiPublicImageModelName(provider, model)
  && !isLikelyNewApiVideoModel(model)
  && !isHiddenCanvasAiImageModel(provider, model),
);

const xaisImageModelResolution = (model?: string | null): CanvasAiImageResolution | null => {
  const { raw, request } = xaisModelTokens(model);
  const combined = `${raw}|${request}`;
  if (combined.includes('1k')) return '1k';
  if (combined.includes('4k')) return '4k';
  if (combined.includes('2k')) return '2k';
  return null;
};

export const getCanvasAiImageResolutionValues = (
  provider?: string | null,
  model?: string | null,
): CanvasAiImageResolution[] => {
  const family = getCanvasAiImageModelFamily(provider, model);
  if (family === 'gpt-image-2') return ['1k', '2k', '4k'];
  if (family === 'nano-banana-pro' || family === 'nano-banana-2' || family === 'gpt-image-2-h') {
    return ['2k', '4k'];
  }
  return [];
};

export const normalizeCanvasAiImageResolutionForModel = (
  provider?: string | null,
  model?: string | null,
  resolution?: string | null,
) => {
  const allowed = getCanvasAiImageResolutionValues(provider, model);
  const normalized = normalizeCanvasAiImageResolution(resolution);
  if (allowed.includes(normalized)) return normalized;
  return allowed.includes('2k') ? '2k' : allowed[0] ?? normalized;
};

export const selectCanvasAiImageCandidatesForResolution = (
  candidates: CanvasAiModelCandidate[],
  resolution?: string | null,
) => {
  const visible = candidates.filter(candidate => !isHiddenCanvasAiImageModel(candidate.provider, candidate.model));
  const routes = new Map<string, CanvasAiModelCandidate[]>();
  for (const candidate of visible) {
    const key = [candidate.source, candidate.provider, candidate.providerChannelId || ''].join('|');
    const route = routes.get(key) || [];
    route.push(candidate);
    routes.set(key, route);
  }

  const normalizedResolution = normalizeCanvasAiImageResolution(resolution);
  return Array.from(routes.values()).flatMap(route => {
    const first = route[0];
    if (!first) return [];
    if (first.provider !== 'xais-chat') return [first];
    const exact = route.find(candidate => xaisImageModelResolution(candidate.model) === normalizedResolution);
    return [exact ?? first];
  });
};

export const resolveCanvasAiCandidateInputImages = async (
  inputImages: string[] | undefined,
  candidate: CanvasAiModelCandidate,
  prepareInputImagesForCandidate?: (candidate: CanvasAiModelCandidate) => Promise<string[]>,
) => prepareInputImagesForCandidate
  ? prepareInputImagesForCandidate(candidate)
  : (inputImages || []);

export const shouldUsePortableWalletImageReferences = (
  cloudWallet: boolean,
  mediaType: 'image' | 'video',
) => cloudWallet && mediaType === 'image';

export const sortCanvasAiImageCandidatesByChannelPriority = (
  candidates: CanvasAiModelCandidate[],
  orderedChannelIds: string[],
) => {
  const priority = new Map(orderedChannelIds.map((id, index) => [id, index]));
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const leftPriority = left.candidate.providerChannelId
        ? priority.get(left.candidate.providerChannelId) ?? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER;
      const rightPriority = right.candidate.providerChannelId
        ? priority.get(right.candidate.providerChannelId) ?? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(({ candidate }) => candidate);
};

const refreshWalletImageCandidatePriority = async (candidates: CanvasAiModelCandidate[]) => {
  if (candidates.filter(candidate => candidate.source === 'wallet' && candidate.providerChannelId).length < 2) {
    return candidates;
  }
  try {
    const result = await invoke<{ channels?: Array<{ id?: string }> }>('get_cloud_image_models', {
      provider: null,
    });
    const orderedChannelIds = (result.channels || [])
      .map(channel => String(channel.id || '').trim())
      .filter(Boolean);
    return orderedChannelIds.length > 0
      ? sortCanvasAiImageCandidatesByChannelPriority(candidates, orderedChannelIds)
      : candidates;
  } catch (error) {
    console.warn('Unable to refresh wallet image channel priority; using the current route order.', error);
    return candidates;
  }
};

export const shouldTryNextCanvasAiImageCandidate = (error: unknown) => {
  const message = getErrorMessage(error).trim();
  const statusMatch = message.match(/(?:status[_ ]?code\s*[=:]\s*|HTTP\s+)(\d{3})/i);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  if ([400, 401, 402, 403, 404, 422, 429].includes(status)) return true;
  return /(?:insufficient[_\s-]*(?:credits?|balance)|quota[_\s-]*(?:exceeded|insufficient)|provider_(?:unavailable|auth_failed)|invalid[_\s-]*api[_\s-]*key|authentication failed|unauthorized|forbidden|model[^\n]{0,80}(?:not found|unsupported|unavailable)|(?:not found|unsupported)[^\n]{0,80}model|(?:provided|reference|input) image is not valid|invalid (?:provided|reference|input) image|(?:compute|server|system|service|resource)[_\s-]*(?:busy|overloaded|exhausted|unavailable)|(?:capacity|resources?)[^\n]{0,80}(?:full|busy|exhausted|unavailable|insufficient)|temporarily unavailable|no available (?:worker|resource|capacity)|operation copy failed|copy operation failed|source path does not exist|no such file|file (?:does not exist|not found)|余额不足|额度不足|渠道不可用|渠道鉴权失败|算力(?:紧张|不足|已满)|(?:系统|服务|服务器|资源|渠道)(?:繁忙|拥堵|过载)|暂无可用算力|资源不足|排队已满|源文件不存在|文件(?:复制失败|不存在|未找到))/i.test(message);
};

export const shouldRetrySameCanvasAiImageCandidate = (error: unknown) => {
  const message = getErrorMessage(error).trim();
  const statusMatch = message.match(/(?:status[_ ]?code\s*[=:]\s*|HTTP\s+)(\d{3})/i);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  if ([429, 503, 529].includes(status)) return true;
  return /(?:compute|server|system|service|resource)[_\s-]*(?:busy|overloaded|exhausted|unavailable)|(?:capacity|resources?)[^\n]{0,80}(?:full|busy|exhausted|unavailable|insufficient)|temporarily unavailable|no available (?:worker|resource|capacity)|算力(?:紧张|不足|已满)|(?:系统|服务|服务器|资源|渠道)(?:繁忙|拥堵|过载)|暂无可用算力|资源不足|排队已满/i.test(message);
};

export const getXaisImageModelDisplayName = (model?: string | null) => {
  const family = getCanvasAiImageModelFamily('xais-chat', model);
  if (family) return imageFamilyLabel(family);
  const normalized = normalizeXaisImage2Model(model || XAIS_CHAT_IMAGE_MODEL_DEFAULT);
  const optionLabel = XAIS_CHAT_IMAGE_MODEL_OPTIONS.find(option => option.value === normalized)?.label;
  if (optionLabel) return optionLabel;
  return resolveXaisImageRequestModel(normalized)
    .replace(/_/g, ' ')
    .replace(/\s+0$/g, '')
    .trim();
};

export const isXaisImage2Model = (model?: string | null) => (
  !!XAIS_IMAGE2_RATIO_OPTIONS_BY_MODEL[normalizeXaisImage2Model(model)]
);

export const getXaisImage2RatioOptions = (model?: string | null) => (
  XAIS_IMAGE2_RATIO_OPTIONS_BY_MODEL[normalizeXaisImage2Model(model)] || []
);

const parseRatioParts = (value?: string | null) => {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)\s*(?::|x|×)\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
};

const gcd = (a: number, b: number): number => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
};

const parseAspectRatio = (aspectRatio?: string) => {
  const parsed = parseRatioParts(aspectRatio) || { width: 1, height: 1 };
  const widthRatio = parsed.width;
  const heightRatio = parsed.height;
  const divisor = gcd(widthRatio, heightRatio);
  return {
    ratio: `${Math.round(widthRatio / divisor)}:${Math.round(heightRatio / divisor)}`,
    value: widthRatio / heightRatio,
  };
};

export const resolveXaisImage2Ratio = (model?: string | null, aspectRatio?: string | null) => {
  const options = getXaisImage2RatioOptions(model);
  if (options.length === 0) return String(aspectRatio || '1:1');
  const value = String(aspectRatio || '').trim();
  if (options.includes(value)) return value;

  const target = parseAspectRatio(value || '1:1').value;
  return options.reduce((best, option) => {
    const bestDiff = Math.abs(parseAspectRatio(best).value - target);
    const optionDiff = Math.abs(parseAspectRatio(option).value - target);
    return optionDiff < bestDiff ? option : best;
  }, options[0]);
};

const xaisImage2QualityFromModel = (model?: string | null) => (
  /高画质/.test(normalizeXaisImage2Model(model)) ? 'high' : 'medium'
);

const isXaisNanoImageModel = (model?: string | null) => (
  /^Xais Nano/i.test(normalizeXaisImage2Model(model))
);

const isXaisNanoLiteImageModel = (model?: string | null) => (
  normalizeXaisImage2Model(model) === 'Xais Nano_Lite_1K'
);

const XAIS_IMAGE_TASK_MAX_WAIT_MS = 90 * 1000;
const XAIS_IMAGE_TASK_POLL_INTERVAL_MS = 2200;

const collectImageStrings = (value: unknown, output: string[] = []): string[] => {
  if (!value) return output;

  if (typeof value === 'string') {
    const dataUrls = value.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/g);
    if (dataUrls) output.push(...dataUrls);
    const markdownUrls = Array.from(value.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g))
      .map(match => match[1])
      .filter(Boolean);
    output.push(...markdownUrls);
    const urls = value.match(/https?:\/\/[^\s"'<>)}\]]+/gi);
    if (urls) {
      output.push(...urls.map(url => url.replace(/[.,;，。；]+$/g, '')));
    }
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectImageStrings(item, output));
    return output;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const inlineMime = record.mime_type ?? record.mimeType;
    const inlineData = record.data;
    if (typeof inlineMime === 'string' && inlineMime.startsWith('image/') && typeof inlineData === 'string') {
      output.push(`data:${inlineMime};base64,${inlineData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')}`);
    }
    for (const [key, nested] of Object.entries(record)) {
      const normalizedKey = key.toLowerCase();
      if (typeof nested === 'string') {
        if (normalizedKey === 'b64_json' || normalizedKey === 'image_base64' || normalizedKey === 'base64') {
          output.push(`data:image/png;base64,${nested.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')}`);
          continue;
        }
        if (
          /^https?:\/\//i.test(nested) &&
          /(url|uri|href|download|output|image|file|result)/i.test(normalizedKey)
        ) {
          output.push(nested);
          continue;
        }
      }
      collectImageStrings(nested, output);
    }
  }

  return output;
};

const cleanExtractedMediaUrl = (value: string) => (
  String(value || '')
    .trim()
    .replace(/^["'`]+/g, '')
    .replace(/["'`\\]+$/g, '')
    .replace(/[.,;，。；]+$/g, '')
);

const hasImageFileExtension = (value: string) => {
  const clean = cleanExtractedMediaUrl(value).split(/[?#]/)[0] || '';
  return /\.(?:jpe?g|png|webp|gif|bmp|svg)$/i.test(clean);
};

const collectVideoStrings = (value: unknown, output: string[] = []): string[] => {
  if (!value) return output;

  if (typeof value === 'string') {
    const dataUrls = value.match(/data:video\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/g);
    if (dataUrls) output.push(...dataUrls);
    const markdownUrls = Array.from(value.matchAll(/\[[^\]]*\]\(([^)]+)\)/g))
      .map(match => match[1])
      .filter(Boolean);
    output.push(...markdownUrls.map(cleanExtractedMediaUrl).filter(url => /^https?:\/\//i.test(url)));
    const urls = value.match(/https?:\/\/[^\s"'<>)}\]]+/gi);
    if (urls) {
      output.push(...urls.map(cleanExtractedMediaUrl));
    }
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectVideoStrings(item, output));
    return output;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const [key, nested] of Object.entries(record)) {
      const normalizedKey = key.toLowerCase();
      if (/^(?:error|err|message|msg|detail|upret|trace|stack|raw|debug)$/i.test(normalizedKey)) {
        continue;
      }
      if (typeof nested === 'string') {
        if (
          /^https?:\/\//i.test(nested) &&
          /(url|uri|href|download|output|video|file|result)/i.test(normalizedKey)
        ) {
          output.push(cleanExtractedMediaUrl(nested));
          continue;
        }
        if (
          normalizedKey === 'b64_json' ||
          normalizedKey === 'video_base64' ||
          normalizedKey === 'base64'
        ) {
          output.push(`data:video/mp4;base64,${nested.replace(/^data:video\/[a-zA-Z0-9.+-]+;base64,/, '')}`);
          continue;
        }
      }
      collectVideoStrings(nested, output);
    }
  }

  return output;
};

const collectXaisWorkerMediaStrings = (value: unknown, mediaType: 'image' | 'video') => (
  mediaType === 'video' ? collectVideoStrings(value) : collectImageStrings(value)
);

const parseAiResponseText = (text: string): unknown => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  const sseValues = Array.from(trimmed.matchAll(/^data:\s*(.+)$/gmi))
    .map(match => match[1]?.trim())
    .filter(value => value && !/^\[DONE\]$/i.test(value));
  if (sseValues.length > 0) {
    const parsedValues = sseValues.map(value => {
      try {
        return JSON.parse(value);
      } catch (_) {
        return value;
      }
    });
    return parsedValues.length === 1 ? parsedValues[0] : parsedValues;
  }
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return trimmed;
  }
};

const getTaskIdFromResponse = (value: unknown): string => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = getTaskIdFromResponse(item);
      if (nested) return nested;
    }
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim().replace(/^"+|"+$/g, '');
  }
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const direct = record.task_id || record.taskId || record.id || record.data || record.result;
  if (typeof direct === 'string' || typeof direct === 'number') return String(direct).trim();
  const arrays = [record.data, record.result, record.results, record.task, record.tasks];
  for (const arrayValue of arrays) {
    if (!Array.isArray(arrayValue)) continue;
    for (const item of arrayValue) {
      const nested = getTaskIdFromResponse(item);
      if (nested) return nested;
    }
  }
  const objects = [record.data, record.result, record.task, record.tasks, record.response];
  for (const objectValue of objects) {
    if (!objectValue || typeof objectValue !== 'object' || Array.isArray(objectValue)) continue;
    const nested = getTaskIdFromResponse(objectValue);
    if (nested) return nested;
  }
  return '';
};

const delay = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const getTextViaTauriWithRetry = async (
  url: string,
  apiKey: string,
  label: string,
  attempts = 4,
  delayMs = 1400,
  context?: CanvasAiRequestContext,
) => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getTextViaTauri(url, apiKey, context);
    } catch (error) {
      lastError = error;
      if (isUnauthorizedError(error) || (!isRetryableServerError(error) && /HTTP\s*4\d\d/i.test(getErrorMessage(error)))) {
        throw error;
      }
      if (attempt < attempts - 1) {
        await delay(delayMs * (attempt + 1));
      }
    }
  }
  throw new Error(`${label}失败：${getErrorMessage(lastError)}`);
};

const isXaisWorkerTaskModel = (model?: string | null) => {
  const normalized = normalizeXaisImage2Model(model);
  return XAIS_CHAT_IMAGE_MODEL_OPTIONS.some(option => option.value === normalized);
};

const collectXaisAttachmentIds = (value: unknown, output: string[] = [], trusted = false): string[] => {
  const pushAttachment = (raw: unknown) => {
    const text = String(raw || '').trim().replace(/^"+|"+$/g, '');
    if (!text || /^https?:\/\//i.test(text) || /^data:(?:image|video)\//i.test(text) || text.length > 512) return;
    output.push(text);
  };

  if (typeof value === 'string' || typeof value === 'number') {
    if (trusted) pushAttachment(value);
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectXaisAttachmentIds(item, output, trusted));
    return output;
  }

  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      const isAttachmentKey = /^(result|results|att|atts|attachment|attachments|output|outputs|file|files|url|urls|uri|uris|href|download|downloads)$/i.test(key);
      collectXaisAttachmentIds(nested, output, trusted || isAttachmentKey);
    });
  }

  return Array.from(new Set(output));
};

const resolveXaisAttachmentUrls = async (
  endpoint: string,
  apiKey: string,
  attachments: string[],
  mediaType: 'image' | 'video' = 'image',
  context?: CanvasAiRequestContext,
) => {
  const mediaUrls: string[] = [];
  for (const att of Array.from(new Set(attachments.filter(Boolean)))) {
    const raw = await getTextViaTauriWithRetry(
      `${endpoint}/attUrls?att=${encodeURIComponent(att)}`,
      apiKey,
      'Xais 结果链接解析',
      4,
      1400,
      context,
    );
    const parsed = parseAiResponseText(raw);
    const parsedMedia = collectXaisWorkerMediaStrings(parsed, mediaType);
    if (parsedMedia.length > 0) {
      mediaUrls.push(...parsedMedia);
      continue;
    }
    const directUrl = String(raw || '').trim();
    if (/^https?:\/\//i.test(directUrl)) mediaUrls.push(directUrl);
  }
  return Array.from(new Set(mediaUrls));
};

const resolveXaisVideoAttachmentUrls = async (
  endpoint: string,
  apiKey: string,
  attachments: string[],
  context?: CanvasAiRequestContext,
) => {
  const mediaUrls: string[] = [];
  const cleanAttachments = Array.from(new Set(attachments
    .map(att => att.trim())
    .filter(Boolean)));
  const pushResolvedMedia = (raw: string) => {
    const parsed = parseAiResponseText(raw);
    const parsedMedia = collectXaisWorkerMediaStrings(parsed, 'video');
    if (parsedMedia.length > 0) {
      mediaUrls.push(...parsedMedia);
      return true;
    }
    const directUrl = String(raw || '').trim().replace(/^"+|"+$/g, '');
    if (/^https?:\/\//i.test(directUrl)) {
      mediaUrls.push(directUrl);
      return true;
    }
    return false;
  };

  if (cleanAttachments.length > 1) {
    const batchUrls = Array.from(new Set([
      `${endpoint}/attUrls?att=${encodeURIComponent(JSON.stringify(cleanAttachments))}`,
      `${endpoint}/attUrls?att=${encodeURIComponent(cleanAttachments.join(','))}`,
    ]));
    for (const url of batchUrls) {
      try {
        const raw = await getTextViaTauriWithRetry(url, apiKey, 'Xais video result link resolve', 2, 1000, context);
        if (pushResolvedMedia(raw)) {
          debugXaisVideo('attUrls batch resolved', {
            count: cleanAttachments.length,
            urls: mediaUrls.map(value => value.slice(0, 180)),
          });
          break;
        }
      } catch (error) {
        if (isUnauthorizedError(error)) throw error;
        debugXaisVideo('attUrls batch warning', getErrorMessage(error));
      }
    }
  }

  for (const att of cleanAttachments) {
    const cleanAtt = att.trim();
    const urls = Array.from(new Set([
      `${endpoint}/attUrls?att=${encodeURIComponent(cleanAtt)}`,
      `${endpoint}/attUrls?att=${cleanAtt}`,
      `${endpoint}/attUrls?att=${encodeURIComponent(JSON.stringify([cleanAtt]))}`,
    ]));
    let lastError: unknown = null;
    for (const url of urls) {
      let raw = '';
      try {
        raw = await getTextViaTauriWithRetry(url, apiKey, 'Xais video result link resolve', 2, 1000, context);
      } catch (error) {
        lastError = error;
        if (isUnauthorizedError(error)) throw error;
        continue;
      }
      if (pushResolvedMedia(raw)) {
        break;
      }
    }
    if (lastError) {
      debugXaisVideo('attUrls fallback warning', {
        att: cleanAtt,
        error: getErrorMessage(lastError),
      });
    }
  }
  return Array.from(new Set(mediaUrls));
};

const generateXaisWorkerTaskImages = async (options: CanvasAiImageOptions, count: number) => {
  const apiKey = options.apiKey.trim();
  const prompt = options.prompt.trim();
  if (!apiKey && !options.licenseManaged) throw new Error('请先填写 Xais API Key');
  if (!prompt) throw new Error('请输入生图提示词');

  const model = normalizeXaisImage2Model(options.model || XAIS_CHAT_IMAGE_MODEL_DEFAULT);
  const requestModel = resolveXaisImageRequestModel(model);
  const endpoint = normalizeXaisWorkerEndpoint(options.endpoint || '');
  const requestCount = Math.max(1, Math.min(4, count));
  const referenceInputs = (options.inputImages || [])
    .map(image => String(image || '').trim())
    .filter(Boolean)
    .slice(0, 8);
  const inputImages = referenceInputs
    .filter(image => isRemoteHttpImageSource(image) || isXaisAttachmentImageRef(image));
  if (referenceInputs.length > 0 && inputImages.length === 0) {
    throw new Error('XAIS 收到的参考图格式不兼容，已停止本次请求，避免错误地按纯文字生成。');
  }
  const isNanoModel = isXaisNanoImageModel(model);
  const isNanoLiteModel = isXaisNanoLiteImageModel(model);
  const requestRatio = getXaisImage2RatioOptions(model).length > 0
    ? resolveXaisImage2Ratio(model, options.aspectRatio)
    : normalizeImageAspectRatio(options.aspectRatio);
  const promptText = prompt;
  const negativePrompt = normalizeNegativePrompt(options.negativePrompt);
  const output: string[] = [];

  const runOneTask = async () => {
    const customField: Record<string, unknown> = {
      outputFormat: outputMimeFromFormat(options.outputFormat),
    };
    if (!isNanoModel || isNanoLiteModel) {
      customField.quality = xaisImage2QualityFromModel(model);
    }

    const taskBody: Record<string, unknown> = {
      prompt: promptText,
      model: requestModel,
      custom_field: customField,
    };
    if (negativePrompt) taskBody.negative_prompt = negativePrompt;
    taskBody.ratio = requestRatio;
    if (!isNanoModel) taskBody.client = 'XAIS';
    if (inputImages.length > 0) {
      taskBody.ref = inputImages;
    }

    debugXaisImage2('workerTaskStart request', {
      clientRequestId: options.clientRequestId,
      endpoint,
      model,
      requestModel,
      ratio: requestRatio,
      referenceInputCount: referenceInputs.length,
      refCount: inputImages.length,
      refs: inputImages.map(image => isXaisAttachmentImageRef(image) ? image : '[remote-url]'),
      custom_field: customField,
    });
    let startedRaw = '';
    let started: unknown = null;
    let startFailure = '';
    let startError: unknown = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        if (attempt > 0) await delay(1800 * attempt);
        startedRaw = await postTextViaTauri(`${endpoint}/workerTaskStart`, apiKey, taskBody, options);
        debugXaisImage2('workerTaskStart response', {
          attempt: attempt + 1,
          raw: trimDebugText(startedRaw),
        });
        started = parseAiResponseText(startedRaw);
        startFailure = getXaisWorkerTaskFailureMessage(started);
        if (!startFailure || !isXaisWorkerTaskOverloadMessage(startFailure) || attempt >= 3) break;
      } catch (error) {
        startError = error;
        const message = getErrorMessage(error);
        debugXaisImage2('workerTaskStart error', {
          attempt: attempt + 1,
          message: trimDebugText(message),
        });
        if (!isXaisWorkerTaskOverloadMessage(message) || attempt >= 3) {
          throw new Error(isXaisWorkerTaskOverloadMessage(message)
            ? `Xais ${model} 当前模型繁忙，请稍后再试或切换模型：${message}`
            : message);
        }
      }
    }
    if (startFailure) throw new Error(isXaisWorkerTaskOverloadMessage(startFailure)
      ? `Xais ${model} 当前模型繁忙，请稍后再试或切换模型：${startFailure}`
      : `Xais ${model} 任务启动失败：${startFailure}`);
    if (!started && startError) throw new Error(getErrorMessage(startError));
    const immediateImages = collectImageStrings(started);
    if (immediateImages.length > 0) return immediateImages;

    const taskId = getTaskIdFromResponse(started);
    if (!taskId) {
      throw new Error(`Xais ${model} 没有返回任务 ID：${String(startedRaw).slice(0, 180)}`);
    }

    let lastWait: unknown = null;
    const waitStartedAt = Date.now();
    for (let attempt = 0; Date.now() - waitStartedAt < XAIS_IMAGE_TASK_MAX_WAIT_MS; attempt += 1) {
      if (attempt > 0) await delay(XAIS_IMAGE_TASK_POLL_INTERVAL_MS);
      const waitedRaw = await getTextViaTauriWithRetry(
        `${endpoint}/workerTaskWait?json=1&id=${encodeURIComponent(taskId)}`,
        apiKey,
        `Xais ${model} 任务等待`,
        4,
        1400,
        options,
      );
      const waited = parseAiResponseText(waitedRaw);
      debugXaisImage2('workerTaskWait response', {
        attempt: attempt + 1,
        taskId,
        raw: trimDebugText(waitedRaw),
      });
      lastWait = waited;
      const waitFailure = getXaisWorkerTaskFailureMessage(waited);
      if (waitFailure) throw new Error(`Xais ${model} task failed: ${waitFailure}`);
      const waitedImages = collectImageStrings(waited);
      if (waitedImages.length > 0) return waitedImages;

      const attachments = collectXaisAttachmentIds(waited);
      if (attachments.length > 0) {
        const urls = await resolveXaisAttachmentUrls(endpoint, apiKey, attachments, 'image', options);
        if (urls.length > 0) return urls;
      }
    }

    throw new Error(`Xais ${model} 任务完成但没有返回图片 URL：${getErrorMessage(lastWait)}`);
  };

  let lastError: unknown = null;
  while (output.length < requestCount) {
    try {
      output.push(...await runOneTask());
    } catch (error) {
      lastError = error;
      if (output.length === 0) throw error;
      break;
    }
  }

  const unique = Array.from(new Set(output));
  if (unique.length === 0) {
    throw new Error(lastError ? getErrorMessage(lastError) : `Xais ${model} 没有返回图片`);
  }
  return unique.slice(0, requestCount);
};

const normalizeXaisVideoInputMode = (mode?: string | null): CanvasAiVideoInputMode => (
  String(mode || '').trim().toUpperCase() === 'FLF' ? 'FLF' : 'REF'
);

const normalizeXaisVideoDuration = (duration?: number | string | null) => {
  const numeric = Number(duration);
  const safeValue = Number.isFinite(numeric) ? numeric : 15;
  const clamped = Math.max(1.8, Math.min(15.2, safeValue));
  return Number(clamped.toFixed(1));
};

const normalizeXaisVideoResolution = (resolution?: string | null) => {
  const trimmed = String(resolution || '').trim();
  return ['480p', '720p', '1080p'].includes(trimmed) ? trimmed : '720p';
};

const XAIS_VIDEO_TASK_MAX_WAIT_MS = 25 * 60 * 1000;
const XAIS_VIDEO_TASK_POLL_INTERVAL_MS = 2200;
const XAIS_VIDEO_TASK_FAILURE_CONFIRM_MS = 15000;
const XAIS_VIDEO_TASK_FAILURE_CONFIRM_COUNT = 3;
const XAIS_VIDEO_REF_MODE_MAX_REFERENCES = 13;
const XAIS_DEBUG_PREFIX = '[canvas:xais-video]';

const trimDebugText = (value: unknown, max = 900) => {
  const text = typeof value === 'string' ? value : getErrorMessage(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

export const debugXaisImage2 = (label: string, value?: unknown) => {
  try {
    if (typeof console === 'undefined') return;
    const at = new Date().toISOString();
    const line = JSON.stringify({ at, label, value }, (_key, nested) => (
      typeof nested === 'string' && nested.length > 4000 ? `${nested.slice(0, 4000)}...` : nested
    ));
    void invoke('append_ai_debug_log', { name: 'xais-image2', line }).catch(() => {});
    if (value === undefined) console.info('[canvas:xais-image2]', label);
    else console.info('[canvas:xais-image2]', label, value);
  } catch (_) {
    // Best-effort diagnostics only.
  }
};

const debugXaisVideo = (label: string, value?: unknown) => {
  try {
    if (typeof console === 'undefined') return;
    const at = new Date().toISOString();
    if (typeof window !== 'undefined') {
      const target = window as unknown as {
        __lastCanvasXaisVideoDebug?: Array<{ at: string; label: string; value?: unknown }>;
      };
      const previous = Array.isArray(target.__lastCanvasXaisVideoDebug)
        ? target.__lastCanvasXaisVideoDebug
        : [];
      target.__lastCanvasXaisVideoDebug = [
        ...previous.slice(-79),
        { at, label, value },
      ];
    }
    const line = JSON.stringify({ at, label, value }, (_key, nested) => (
      typeof nested === 'string' && nested.length > 4000 ? `${nested.slice(0, 4000)}...` : nested
    ));
    void invoke('append_ai_debug_log', { name: 'xais-video', line }).catch(() => {});
    if (value === undefined) console.info(XAIS_DEBUG_PREFIX, label);
    else console.info(XAIS_DEBUG_PREFIX, label, value);
  } catch (_) {
    // Best-effort diagnostics only.
  }
};

const isXaisWorkerTaskPendingMessage = (message: string) => (
  /(?:pending|queued|queue|running|processing|in[_\s-]?progress|progress|waiting|not\s+ready|not\s+finished|unfinished|no\s+result|no\s+output|empty\s+result|result\s+empty|暂无|无结果|没有结果|未返回|进行中|生成中|排队|处理中|等待|未完成)/i.test(message)
);

const isXaisWorkerTaskOverloadMessage = (message: string) => (
  /TASK_MODEL_OVERLOAD|model[_\s-]?overload|overload|模型.*(?:繁忙|过载|拥挤|排队)/i.test(message)
);

const getXaisWorkerTaskFailureMessage = (value: unknown): string => {
  if (!value) return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const failure = getXaisWorkerTaskFailureMessage(item);
      if (failure) return failure;
    }
    return '';
  }
  if (typeof value === 'string') {
    if (/^unknown error$/i.test(value.trim())) return '';
    return /(?:fail|failed|failure|error|exception|失败|错误)/i.test(value) ? value : '';
  }
  if (typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const successValue = record.success ?? record.ok;
  if (successValue === false) {
    const message = getErrorMessage(record.error || record.message || record.msg || record.detail || value);
    if (/^unknown error$/i.test(message.trim())) return '';
    if (isXaisWorkerTaskPendingMessage(message)) return '';
    return message;
  }
  const statusText = String(record.status || record.state || record.code || '').trim().toLowerCase();
  if (/^(?:fail|failed|failure|error|exception|cancelled|canceled)$/i.test(statusText)) {
    const message = getErrorMessage(record.error || record.message || record.msg || record.detail || value);
    if (/^unknown error$/i.test(message.trim())) return '';
    return message;
  }
  const rawMessage = record.error || record.message || record.msg || record.detail;
  if (record.error) {
    const message = getErrorMessage(record.error);
    if (/^unknown error$/i.test(message.trim())) return '';
    if (isXaisWorkerTaskPendingMessage(message)) return '';
    return message;
  }
  const numericCode = Number(record.code ?? record.statusCode ?? record.errorCode ?? record.errcode);
  if (rawMessage && Number.isFinite(numericCode) && numericCode !== 0 && numericCode !== 200) {
    const message = getErrorMessage(rawMessage);
    if (/^unknown error$/i.test(message.trim())) return '';
    if (isXaisWorkerTaskPendingMessage(message)) return '';
    return message;
  }
  if (!rawMessage) {
    for (const nested of Object.values(record)) {
      const failure = getXaisWorkerTaskFailureMessage(nested);
      if (failure) return failure;
    }
    return '';
  }
  const message = getErrorMessage(rawMessage);
  if (/^unknown error$/i.test(message.trim())) return '';
  return message && /(?:fail|failed|failure|error|exception|失败|错误)/i.test(message) ? message : '';
};

const isFatalXaisWorkerTaskFailure = (message: string) => (
  /(?:InvalidParameter|CreateAsset|DownloadFailed|Failed to download media|Name must be no more|Bad Gateway|fetch-object|unsupported|forbidden|not accessible)/i.test(message)
);

const generateXaisWorkerTaskVideos = async (options: CanvasAiVideoOptions) => {
  const apiKey = options.apiKey.trim();
  const prompt = options.prompt.trim();
  if (!apiKey && !options.licenseManaged) throw new Error('请先填写 Xais API Key');
  if (!prompt) throw new Error('请输入视频提示词');
  if (options.provider !== 'xais-chat') throw new Error('视频模型当前使用 XAIS 异步接口，请切换到 Xais / DCHAI 中转');

  const model = (options.model || XAIS_CHAT_VIDEO_MODEL_DEFAULT).trim() || XAIS_CHAT_VIDEO_MODEL_DEFAULT;
  const endpoint = normalizeXaisWorkerEndpoint(options.endpoint || '');
  const requestCount = Math.max(1, Math.min(4, Math.round(options.count || 1)));
  const inputMode = normalizeXaisVideoInputMode(options.inputMode);
  const maxReferenceCount = inputMode === 'FLF' ? 2 : XAIS_VIDEO_REF_MODE_MAX_REFERENCES;
  const inputRefs = (options.inputImages || [])
    .filter(source => isRemoteHttpImageSource(source))
    .slice(0, maxReferenceCount);
  if (inputRefs.length === 0) {
    throw new Error('seedance2 参考模式没有拿到公网参考素材 URL：请确认视频节点已连接参考图/参考视频，且 cloudflared 公网分享可用');
  }
  if (inputMode === 'FLF' && inputRefs.length < 2) {
    throw new Error('seedance2 首尾帧模式需要 2 张公网参考图：请分别连接首帧和尾帧');
  }
  const output: string[] = [];
  const inputRefSet = new Set(inputRefs.map(cleanExtractedMediaUrl));
  const isVideoOutputCandidate = (url: string) => {
    const trimmed = cleanExtractedMediaUrl(url);
    if (!/^https?:\/\//i.test(trimmed) && !/^data:video\//i.test(trimmed)) return false;
    if (inputRefSet.has(trimmed)) return false;
    if (hasImageFileExtension(trimmed)) return false;
    return true;
  };
  const collectVideoOutputCandidates = (value: unknown) => (
    Array.from(new Set(
      collectVideoStrings(value)
        .map(cleanExtractedMediaUrl)
        .filter(url => isVideoOutputCandidate(url))
    ))
  );

  const runOneTask = async () => {
    const customField: Record<string, unknown> = {
      res: normalizeXaisVideoResolution(options.resolution),
      input: inputMode,
      duration: String(normalizeXaisVideoDuration(options.duration)),
      outputFormat: 'video/mp4',
    };

    const taskBody: Record<string, unknown> = {
      prompt,
      model,
      ref: inputRefs,
      custom_field: customField,
    };
    if (options.aspectRatio) taskBody.ratio = options.aspectRatio;
    debugXaisVideo('start request', {
      endpoint,
      model,
      refCount: inputRefs.length,
      refs: inputRefs.map((value, index) => `${index + 1}:${value.slice(0, 120)}`),
      custom_field: customField,
      ratio: taskBody.ratio,
    });

    const startedRaw = await postTextViaTauri(`${endpoint}/workerTaskStart`, apiKey, taskBody, options);
    const started = parseAiResponseText(startedRaw);
    debugXaisVideo('start response', trimDebugText(startedRaw));
    const startFailure = getXaisWorkerTaskFailureMessage(started);
    if (startFailure) throw new Error(`Xais ${model} 视频任务启动失败：${startFailure}`);
    const immediateVideos = collectVideoOutputCandidates(started);
    if (immediateVideos.length > 0) return immediateVideos;

    const taskId = getTaskIdFromResponse(started);
    if (!taskId) {
      throw new Error(`Xais ${model} 没有返回任务 ID：${String(startedRaw).slice(0, 180)}`);
    }

    let lastWait: unknown = null;
    let lastWaitRaw = '';
    let firstFailureAt = 0;
    let failureCount = 0;
    let lastFailure = '';
    debugXaisVideo('task id', taskId);
    const resolveTaskIdAttachmentUrls = async (label: string) => {
      try {
        const urls = await resolveXaisVideoAttachmentUrls(endpoint, apiKey, [taskId], options);
        debugXaisVideo(label, urls.map(url => url.slice(0, 180)));
        return urls
          .map(cleanExtractedMediaUrl)
          .filter(url => isVideoOutputCandidate(url));
      } catch (error) {
        if (isUnauthorizedError(error)) throw error;
        debugXaisVideo(`${label} warning`, getErrorMessage(error));
        return [] as string[];
      }
    };
    const waitUntil = Date.now() + XAIS_VIDEO_TASK_MAX_WAIT_MS;
    let attempt = 0;
    while (Date.now() <= waitUntil) {
      if (attempt > 0) await delay(XAIS_VIDEO_TASK_POLL_INTERVAL_MS);
      attempt += 1;
      const waitUrls = [
        `${endpoint}/workerTaskWait?json=1&id=${encodeURIComponent(taskId)}`,
        `${endpoint}/workerTaskWait?id=${encodeURIComponent(taskId)}`,
      ];
      let waitedRaw = '';
      let waitError: unknown = null;
      for (const waitUrl of waitUrls) {
        try {
          waitedRaw = await getTextViaTauriWithRetry(
            waitUrl,
            apiKey,
            `Xais ${model} 视频任务等待`,
            2,
            1200,
            options,
          );
          break;
        } catch (error) {
          waitError = error;
        }
      }
      if (!waitedRaw) {
        const waitErrorMessage = getErrorMessage(waitError);
        lastWaitRaw = waitErrorMessage;
        debugXaisVideo(`wait #${attempt} warning`, waitErrorMessage);
        if (isUnauthorizedError(waitError)) {
          throw new Error(`Xais ${model} 视频任务等待失败：${waitErrorMessage}`);
        }
        if (attempt % 8 === 0) {
          const taskIdVideos = await resolveTaskIdAttachmentUrls(`task-id urls #${attempt}`);
          if (taskIdVideos.length > 0) return taskIdVideos;
        }
        continue;
      }
      const waited = parseAiResponseText(waitedRaw);
      lastWait = waited;
      lastWaitRaw = waitedRaw;
      if (attempt === 1 || attempt % 20 === 0 || /result|att|url|done|fail|error|失败|错误/i.test(waitedRaw)) {
        debugXaisVideo(`wait #${attempt}`, trimDebugText(waitedRaw));
      }
      const failure = getXaisWorkerTaskFailureMessage(waited);
      if (failure) {
        if (!firstFailureAt) firstFailureAt = Date.now();
        failureCount += 1;
        lastFailure = failure;
        debugXaisVideo(`failure candidate #${attempt}`, { failure, failureCount });
        if (
          isFatalXaisWorkerTaskFailure(failure)
          || isFatalXaisWorkerTaskFailure(waitedRaw)
          ||
          failureCount >= XAIS_VIDEO_TASK_FAILURE_CONFIRM_COUNT
          || Date.now() - firstFailureAt >= XAIS_VIDEO_TASK_FAILURE_CONFIRM_MS
        ) {
          throw new Error(`Xais ${model} 视频任务失败：${failure}`);
        }
        continue;
      }
      const attachments = collectXaisAttachmentIds(waited);
      if (attachments.length > 0) {
        debugXaisVideo(`attachments #${attempt}`, attachments);
        const urls = await resolveXaisVideoAttachmentUrls(endpoint, apiKey, attachments, options);
        debugXaisVideo(`resolved urls #${attempt}`, urls.map(url => url.slice(0, 180)));
        const videoUrls = urls
          .map(cleanExtractedMediaUrl)
          .filter(url => isVideoOutputCandidate(url));
        if (videoUrls.length > 0) return videoUrls;
      }

      const waitedVideos = collectVideoOutputCandidates(waited);
      if (waitedVideos.length > 0) return waitedVideos;

      if (attempt % 8 === 0) {
        const taskIdVideos = await resolveTaskIdAttachmentUrls(`task-id urls #${attempt}`);
        if (taskIdVideos.length > 0) return taskIdVideos;
      }

      firstFailureAt = 0;
      failureCount = 0;
      lastFailure = '';
    }

    throw new Error(`Xais ${model} 视频任务超时或没有返回视频 URL：${trimDebugText(lastFailure || lastWaitRaw || lastWait, 260)}`);
  };

  let lastError: unknown = null;
  while (output.length < requestCount) {
    try {
      output.push(...await runOneTask());
    } catch (error) {
      lastError = error;
      if (output.length === 0) throw error;
      break;
    }
  }

  const unique = Array.from(new Set(output));
  if (unique.length === 0) {
    throw new Error(lastError ? getErrorMessage(lastError) : `Xais ${model} 没有返回视频`);
  }
  return unique.slice(0, requestCount);
};

const generateOpenAiCompatibleImages = async (options: CanvasAiImageOptions) => {
  const apiKey = options.apiKey.trim();
  const prompt = options.prompt.trim();
  if (!apiKey && !options.licenseManaged) throw new Error('请先填写 API Key');
  if (!prompt) throw new Error('请输入生图提示词');

  const inputImages = (options.inputImages || []).filter(Boolean).slice(0, 8);
  const model = (options.model || OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT).trim();
  const count = Math.max(1, Math.min(4, Math.round(options.count || 1)));
  const supportsResolution = isGptImage2LikeModel(model);
  const size = supportsResolution
    ? gptImage2SizeFromAspectRatio(options.aspectRatio, options.resolution)
    : imageSizeFromAspectRatio(options.aspectRatio);
  const quality = supportsResolution
    ? normalizeCanvasAiImageResolution(options.resolution) === '4k' ? 'high' : 'standard'
    : undefined;

  if (inputImages.length > 0) {
    const data = await postImageEditViaTauri(normalizeOpenAiEndpoint(options.endpoint || '', 'images/edits'), apiKey, {
      model,
      prompt: buildPromptWithOptions(prompt, options.aspectRatio, options.resolution),
      n: count,
      size,
      ...(quality ? { quality } : {}),
      images: inputImages,
    }, options);
    const images = Array.from(new Set(collectImageStrings(data)));
    if (images.length > 0) return images.slice(0, count);
  }

  const data = await postJsonViaTauri(normalizeOpenAiEndpoint(options.endpoint || '', 'images/generations'), apiKey, {
    model,
    prompt: buildPromptWithOptions(prompt, options.aspectRatio, options.resolution),
    n: count,
    size,
    ...(quality ? { quality } : {}),
    response_format: 'b64_json',
  }, options);
  const images = Array.from(new Set(collectImageStrings(data)));
  if (images.length === 0) throw new Error('接口没有返回图片数据');
  return images.slice(0, count);
};

const generateNewApiImages = async (options: CanvasAiImageOptions) => {
  const apiKey = options.apiKey.trim();
  const prompt = options.prompt.trim();
  if (!apiKey && !options.licenseManaged) throw new Error('Please enter New API Key first.');
  if (!prompt) throw new Error('Please enter an image prompt.');

  const endpoint = normalizeNewApiBaseEndpoint(options.endpoint || '');
  if (!endpoint) throw new Error('Please enter New API Base URL first, for example https://your-new-api.example.com/v1');
  const inputImages = (options.inputImages || []).filter(Boolean).slice(0, 8);
  const model = (options.model || NEW_API_IMAGE_MODEL_DEFAULT).trim() || NEW_API_IMAGE_MODEL_DEFAULT;
  const count = Math.max(1, Math.min(4, Math.round(options.count || 1)));
  const imageParams = newApiImageRequestParams(model, count, options.aspectRatio, options.resolution);
  const promptText = buildPromptWithOptions(prompt, options.aspectRatio, options.resolution);
  const negativePrompt = normalizeNegativePrompt(options.negativePrompt);
  const protocol = getDefaultNewApiImageProtocol(model, inputImages.length > 0);
  const cloudflareReferenceUrls = getCloudflareReferenceUrls(inputImages);
  const referenceHosts = getRemoteReferenceHosts(inputImages);
  const clientRequestId = options.clientRequestId?.trim()
    || `canvas-image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const requestContext = (readiness: NewApiReferenceReadiness): CanvasAiImageOptions => ({
    ...options,
    clientRequestId,
    endpointProtocol: protocol,
    referenceHost: (readiness.referenceHosts.length > 0 ? readiness.referenceHosts : referenceHosts).join(','),
    referenceReadyDurationMs: readiness.readyDurationMs,
    isFirstRequest: true,
    singleAttempt: true,
    timeoutSecs: NEW_API_IMAGE_REQUEST_TIMEOUT_SECS,
  });
  const chatContent = inputImages.length > 0
    ? [
      { type: 'text', text: promptText },
      ...inputImages.map(image => ({
        type: 'image_url',
        image_url: { url: image },
      })),
    ]
    : promptText;

  try {
    const data = await executeNewApiImageProtocol(protocol, cloudflareReferenceUrls, {
      ensureReferencesReady: ensureNewApiReferenceUrlsReady,
      chatCompletions: (readiness) => postJsonViaTauri(
        normalizeNewApiEndpoint(endpoint, 'chat/completions'),
        apiKey,
        {
          model,
          ...imageParams,
          ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
          messages: [{ role: 'user', content: chatContent }],
          modalities: ['image'],
          stream: false,
          max_tokens: 8192,
        },
        requestContext(readiness),
      ),
      imagesEdits: (readiness) => {
        if (inputImages.length === 0) {
          throw new Error('images/edits 需要至少一张参考图。');
        }
        return postImageEditViaTauri(normalizeNewApiEndpoint(endpoint, 'images/edits'), apiKey, {
          model,
          prompt: promptText,
          n: imageParams.n,
          size: imageParams.size,
          ...('quality' in imageParams ? { quality: imageParams.quality } : {}),
          responseFormat: NEW_API_IMAGE_RESPONSE_FORMAT,
          images: inputImages,
        }, requestContext(readiness));
      },
      imagesGenerations: (readiness) => postJsonViaTauri(
        normalizeNewApiEndpoint(endpoint, 'images/generations'),
        apiKey,
        {
          model,
          prompt: promptText,
          ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
          ...imageParams,
          response_format: NEW_API_IMAGE_RESPONSE_FORMAT,
        },
        requestContext(readiness),
      ),
    });
    const images = Array.from(new Set(collectImageStrings(data)));
    if (images.length === 0) {
      throw new Error(`${newApiImageProtocolLabel(protocol)} did not return image data.`);
    }
    return images.slice(0, count);
  } catch (error) {
    const message = getErrorMessage(error);
    if (/Cloudflare 参考图尚未就绪，未提交生图任务/.test(message)) throw error;
    throw new Error(formatNewApiImageProtocolError(protocol, error));
  }
};

const generateXaisChatImages = async (options: CanvasAiImageOptions) => {
  const apiKey = options.apiKey.trim();
  const prompt = options.prompt.trim();
  if (!apiKey && !options.licenseManaged) throw new Error('请先填写 Xais API Key');
  if (!prompt) throw new Error('请输入生图提示词');

  const model = normalizeXaisImage2Model(options.model || XAIS_CHAT_IMAGE_MODEL_DEFAULT);
  const requestModel = resolveXaisImageRequestModel(model);
  const count = Math.max(1, Math.min(4, Math.round(options.count || 1)));
  if (isXaisWorkerTaskModel(model)) {
    return generateXaisWorkerTaskImages({ ...options, model }, count);
  }
  const inputImages = (options.inputImages || []).filter(Boolean).slice(0, 8);
  const promptText = buildChinesePromptWithOptions(prompt, options.aspectRatio, options.resolution);
  const negativePrompt = normalizeNegativePrompt(options.negativePrompt);
  const imageEndpoint = normalizeImageGenerationsEndpoint(options.endpoint || '');
  const chatEndpoint = normalizeChatCompletionsEndpoint(options.endpoint || '');
  const requestImages = async (label: string, url: string, body: unknown, repeatCount: number) => {
    const output: string[] = [];
    let lastError: unknown = null;
    for (let index = 0; index < repeatCount && Array.from(new Set(output)).length < repeatCount; index += 1) {
      try {
        const data = await postJsonViaTauri(url, apiKey, body, options);
        output.push(...collectImageStrings(data));
      } catch (error) {
        lastError = error;
        if (output.length > 0) break;
        throw new Error(isUnauthorizedError(error)
          ? 'Xais / DCHAI 鉴权失败：请填写这个中转自己的 API Key'
          : `${label}失败：${getErrorMessage(error)}`);
      }
    }
    const unique = Array.from(new Set(output));
    if (unique.length === 0) {
      throw new Error(lastError ? `${label}没有返回图片：${getErrorMessage(lastError)}` : `${label}没有返回图片链接`);
    }
    return unique.slice(0, repeatCount);
  };

  const errors: string[] = [];
  if (inputImages.length === 0) {
    try {
      return await requestImages('Xais Images 接口', imageEndpoint, {
        model: requestModel,
        prompt: promptText,
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        n: count,
        size: imageSizeFromAspectRatio(options.aspectRatio),
        response_format: 'url',
      }, count);
    } catch (imageError) {
      if (isUnauthorizedError(imageError)) {
        throw new Error(getErrorMessage(imageError));
      }
      errors.push(getErrorMessage(imageError));
    }
  }

  const content = inputImages.length > 0
    ? [
      { type: 'text', text: promptText },
      ...inputImages.map(image => ({
        type: 'image_url',
        image_url: { url: image },
      })),
    ]
    : promptText;
  const urlTextImages = inputImages.filter(image => isRemoteHttpImageSource(image));
  const urlTextContent = urlTextImages.length > 0
    ? `${promptText}\n\n参考图片 URL：\n${urlTextImages.join('\n')}`
    : promptText;
  const chatBodies = [
    {
      label: 'Xais Chat 接口',
      body: {
        model: requestModel,
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        messages: [
          {
            role: 'user',
            content,
          },
        ],
        stream: false,
        max_tokens: 8192,
      },
    },
    ...(urlTextImages.length > 0 ? [{
      label: 'Xais Chat URL 文本接口',
      body: {
        model: requestModel,
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        messages: [
          {
            role: 'user',
            content: urlTextContent,
          },
        ],
        stream: false,
        max_tokens: 8192,
      },
    }] : []),
  ];

  for (const item of chatBodies) {
    try {
      return await requestImages(item.label, chatEndpoint, item.body, count);
    } catch (error) {
      if (isUnauthorizedError(error)) throw new Error(getErrorMessage(error));
      errors.push(getErrorMessage(error));
      if (!isRetryableServerError(error) && inputImages.length === 0) break;
    }
  }

  throw new Error(`Xais 调用失败：${errors.filter(Boolean).join('；') || '接口没有返回图片链接'}`);
};

const getNewApiVideoTaskState = (value: unknown): string => {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const direct = record.status ?? record.state;
  if (typeof direct === 'string') return direct.trim().toLowerCase();
  for (const nested of [record.data, record.result, record.task, record.response]) {
    const state = getNewApiVideoTaskState(nested);
    if (state) return state;
  }
  return '';
};

const getNewApiVideoFailureMessage = (value: unknown): string => {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const direct = record.error ?? record.fail_reason ?? record.failure_reason;
  if (direct) return getErrorMessage(direct);
  for (const nested of [record.data, record.result, record.task, record.response]) {
    const message = getNewApiVideoFailureMessage(nested);
    if (message) return message;
  }
  return typeof record.message === 'string' ? record.message : '';
};

export const formatNewApiVideoFailureMessage = (message?: string | null) => {
  const raw = String(message || '').trim();
  if (/cloudflare.*(?:403|challenge)|(?:403|429).*cloudflare|list recipes failed/i.test(raw)) {
    return 'NewAPI 上游视频渠道触发 Cloudflare 403/429 限流或挑战，客户端无法绕过。请稍后重试，或在 NewAPI 后台更换/修复视频渠道。';
  }
  return raw;
};

const collectNewApiVideoResults = (value: unknown, inputImages: string[]) => {
  const inputSet = new Set(inputImages.map(cleanExtractedMediaUrl));
  return Array.from(new Set(collectVideoStrings(value)
    .map(cleanExtractedMediaUrl)
    .filter(url => (
      (/^https?:\/\//i.test(url) || /^data:video\//i.test(url))
      && !inputSet.has(url)
      && !hasImageFileExtension(url)
    ))));
};

const NEW_API_VIDEO_TASK_MAX_WAIT_MS = 25 * 60 * 1000;
const NEW_API_VIDEO_TASK_POLL_INTERVAL_MS = 2500;

const generateNewApiVideos = async (options: CanvasAiVideoOptions) => {
  const apiKey = options.apiKey.trim();
  const prompt = options.prompt.trim();
  const model = String(options.model || '').trim();
  if (!apiKey && !options.licenseManaged) throw new Error('请先填写 New API Key 或视频 API Key');
  if (!prompt) throw new Error('请输入视频提示词');
  if (!model) throw new Error('请先在视频节点选择 NewAPI 视频模型');

  const endpoint = normalizeNewApiEndpoint(options.endpoint || '', 'video/generations');
  const inputImages = (options.inputImages || []).filter(Boolean).slice(0, 8);
  const requestCount = Math.max(1, Math.min(4, Math.round(options.count || 1)));
  const output: string[] = [];

  for (let index = 0; index < requestCount; index += 1) {
    const body = newApiVideoRequestParams({
      model,
      prompt,
      inputImages,
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
      duration: options.duration,
      inputMode: options.inputMode,
      count: 1,
    });
    const started = await postJsonViaTauri(endpoint, apiKey, body, options);
    const immediate = collectNewApiVideoResults(started, inputImages);
    if (immediate.length > 0) {
      output.push(...immediate);
      continue;
    }
    const taskId = getTaskIdFromResponse(started);
    if (!taskId) throw new Error('NewAPI 视频接口没有返回 task_id');

    const waitUntil = Date.now() + NEW_API_VIDEO_TASK_MAX_WAIT_MS;
    let lastStatus: unknown = started;
    while (Date.now() <= waitUntil) {
      await delay(NEW_API_VIDEO_TASK_POLL_INTERVAL_MS);
      const status = await getJsonViaTauri(`${endpoint}/${encodeURIComponent(taskId)}`, apiKey, options);
      lastStatus = status;
      const videos = collectNewApiVideoResults(status, inputImages);
      if (videos.length > 0) {
        output.push(...videos);
        break;
      }
      const state = getNewApiVideoTaskState(status);
      if (/^(?:failed|failure|error|cancelled|canceled)$/.test(state)) {
        const failure = formatNewApiVideoFailureMessage(getNewApiVideoFailureMessage(status));
        throw new Error(failure || `NewAPI 视频任务失败：${taskId}`);
      }
    }
    if (output.length <= index) {
      const failure = formatNewApiVideoFailureMessage(getNewApiVideoFailureMessage(lastStatus));
      throw new Error(`NewAPI 视频任务超时或没有返回视频：${failure || taskId}`);
    }
  }

  return Array.from(new Set(output)).slice(0, requestCount);
};

export const generateCanvasAiProviderImages = async (options: CanvasAiImageOptions): Promise<string[]> => {
  if (!options.singleAttempt && options.providerCandidates && options.providerCandidates.length > 0) {
    const prioritizedCandidates = await refreshWalletImageCandidatePriority(options.providerCandidates);
    const candidates = selectCanvasAiImageCandidatesForResolution(
      prioritizedCandidates,
      options.resolution,
    );
    let lastError: unknown = null;
    for (const candidate of candidates) {
      let candidateError: unknown = null;
      let candidateInputImages = options.inputImages || [];
      try {
        candidateInputImages = await resolveCanvasAiCandidateInputImages(
          options.inputImages,
          candidate,
          options.prepareInputImagesForCandidate,
        );
      } catch (error) {
        candidateError = error;
      }
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (candidateError) break;
        try {
          const runtime = options.providerRuntime?.[candidate.provider];
          return await generateCanvasAiProviderImages({
            ...options,
            provider: candidate.provider,
            model: candidate.model,
            providerChannelId: candidate.providerChannelId,
            cloudWallet: candidate.source === 'wallet',
            apiKey: runtime?.apiKey ?? options.apiKey,
            endpoint: runtime?.endpoint ?? options.endpoint,
            headers: runtime?.headers ?? options.headers,
            apiProvider: runtime?.apiProvider ?? options.apiProvider,
            gatewayKind: runtime?.gatewayKind ?? options.gatewayKind,
            licenseManaged: runtime?.licenseManaged ?? options.licenseManaged,
            inputImages: candidateInputImages,
            providerCandidates: undefined,
            prepareInputImagesForCandidate: undefined,
          });
        } catch (error) {
          candidateError = error;
          if (attempt === 0 && shouldRetrySameCanvasAiImageCandidate(error)) {
            console.warn('Canvas AI preferred channel is temporarily busy; retrying the same channel', candidate, error);
            await delay(1_200);
            continue;
          }
          break;
        }
      }
      if (!shouldTryNextCanvasAiImageCandidate(candidateError)) throw candidateError;
      lastError = candidateError;
      console.warn('Canvas AI model candidate failed, trying next candidate', candidate, candidateError);
    }
    throw lastError instanceof Error ? lastError : new Error(getErrorMessage(lastError));
  }
  if (options.cloudWallet) return generateCloudWalletImages(options);
  if (options.provider === 'xais-chat') return generateXaisChatImages(options);
  if (options.provider === 'new-api') return generateNewApiImages(options);
  return generateOpenAiCompatibleImages(options);
};

export const generateCanvasAiProviderVideos = async (options: CanvasAiVideoOptions): Promise<string[]> => {
  if (!options.singleAttempt && options.providerCandidates && options.providerCandidates.length > 1) {
    let lastError: unknown = null;
    for (const candidate of options.providerCandidates) {
      try {
        const runtime = options.providerRuntime?.[candidate.provider];
        return await generateCanvasAiProviderVideos({
          ...options,
          provider: candidate.provider,
          model: candidate.model,
          providerChannelId: candidate.providerChannelId,
          cloudWallet: candidate.source === 'wallet',
          apiKey: runtime?.apiKey ?? options.apiKey,
          endpoint: runtime?.endpoint ?? options.endpoint,
          headers: runtime?.headers ?? options.headers,
          apiProvider: runtime?.apiProvider ?? options.apiProvider,
          gatewayKind: runtime?.gatewayKind ?? options.gatewayKind,
          licenseManaged: runtime?.licenseManaged ?? options.licenseManaged,
          providerCandidates: undefined,
        });
      } catch (error) {
        lastError = error;
        console.warn('Canvas AI video candidate failed, trying next candidate', candidate, error);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(getErrorMessage(lastError));
  }
  if (options.cloudWallet) return generateCloudWalletVideos(options);
  if (options.provider === 'xais-chat') return generateXaisWorkerTaskVideos(options);
  if (options.provider === 'new-api') return generateNewApiVideos(options);
  throw new Error(`当前 Gateway 不支持视频生成：${options.provider}`);
};
