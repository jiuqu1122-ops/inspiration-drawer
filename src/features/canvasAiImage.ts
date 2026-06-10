import { invoke } from '@tauri-apps/api/core';

export const OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT = 'gpt-image-1';
export const OPENAI_COMPATIBLE_ENDPOINT_DEFAULT = 'https://api.openai.com/v1';
export const XAIS_CHAT_ENDPOINT_DEFAULT = 'https://sg2.dchai.cn';
export const XAIS_CHAT_IMAGE_MODEL_DEFAULT = 'Nano_Banana_Pro_2K_0';
export const AODUO_AI_ENDPOINT_DEFAULT = 'https://api.lk888.ai';
export const AODUO_AI_IMAGE_MODEL_DEFAULT = 'nanobanana-pro';
export const AODUO_AI_GPT_IMAGE_2_MODEL = 'gpt-image-2';
export const AODUO_AI_GPT_IMAGE_2_GUAN_MODEL = 'gpt-image-2-guan';

export const OPENAI_COMPATIBLE_IMAGE_MODEL_OPTIONS = [
  { value: OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT, label: 'gpt-image-1' },
  { value: 'dall-e-3', label: 'DALL-E 3' },
  { value: 'dall-e-2', label: 'DALL-E 2' },
];

export const XAIS_CHAT_IMAGE_MODEL_OPTIONS = [
  { value: XAIS_CHAT_IMAGE_MODEL_DEFAULT, label: 'Nano Banana Pro 2K' },
  { value: 'Nano_Banana_Pro_4K_0', label: 'Nano Banana Pro 4K' },
  { value: 'Nano_Banana_2_2K_0', label: 'Nano Banana 2 2K' },
  { value: 'Nano_Banana_2_4K_0', label: 'Nano Banana 2 4K' },
  { value: 'Image2_1K', label: 'Xais img2 1K' },
  { value: 'Image2_2K', label: 'Xais Img2 2K' },
  { value: 'Image2_4K', label: 'Xais Img2 4K' },
  { value: 'Image2_4K_HQ', label: 'Xais Img2 4K 高画质' },
  { value: 'Nano_Banana_Pro_2K_5', label: 'Nano Banana Pro 2K 5' },
  { value: 'Nano_Banana_Pro_4K_5', label: 'Nano Banana Pro 4K 5' },
  { value: 'c3f', label: 'c3f' },
];

export const AODUO_AI_IMAGE_MODEL_OPTIONS = [
  { value: AODUO_AI_IMAGE_MODEL_DEFAULT, label: 'nanobanana-pro' },
  { value: 'nanobanana-2', label: 'nanobanana-2' },
  { value: 'qwen-image-max', label: 'qwen-image-max' },
  { value: AODUO_AI_GPT_IMAGE_2_MODEL, label: 'GPT Image 2' },
  { value: AODUO_AI_GPT_IMAGE_2_GUAN_MODEL, label: 'GPT Image 2 官转' },
];

export const CANVAS_AI_PROVIDER_OPTIONS = [
  { value: 'xais-chat', label: 'Xais / DCHAI 中转' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
  { value: 'aoduo-ai', label: '中转2' },
] as const;

export type CanvasAiImageProvider = typeof CANVAS_AI_PROVIDER_OPTIONS[number]['value'];

export type CanvasAiBaseImageOptions = {
  apiKey: string;
  prompt: string;
  model?: string;
  inputImages?: string[];
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  count?: number;
};

export type CanvasAiImageOptions = CanvasAiBaseImageOptions & {
  provider: CanvasAiImageProvider;
  endpoint?: string;
};

const getErrorMessage = (error: unknown) => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    const value = error as {
      message?: string;
      detail?: string;
      error?: string | { message?: string; detail?: string; code?: string | number };
      error_description?: string;
    };
    if (typeof value.error === 'string') return value.error;
    return value.message
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

const isRemoteHttpImageSource = (source?: string | null) => (
  /^https?:\/\//i.test(String(source || '').trim()) && !/asset\.localhost|localhost|127\.0\.0\.1/i.test(String(source || ''))
);

const buildPromptWithOptions = (prompt: string, aspectRatio?: string, resolution?: string) => {
  const constraints = [
    aspectRatio ? `aspect ratio ${aspectRatio}` : '',
    resolution ? `target resolution ${resolution}` : '',
  ].filter(Boolean);
  if (constraints.length === 0) return prompt.trim();
  return `${prompt.trim()}\n\nImage constraints: ${constraints.join(', ')}.`;
};

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
  const fallback = 'https://xais.dchai.cn/xais';
  let trimmed = (endpoint || fallback).trim().replace(/\/+$/, '');
  if (!trimmed || /sg2c?\.dchai\.cn/i.test(trimmed)) return fallback;
  trimmed = trimmed
    .replace(/\/v1\/(?:models|images\/generations|images\/edits|chat\/completions)$/i, '')
    .replace(/\/workerTask(?:Start|Wait)$/i, '')
    .replace(/\/attUrls$/i, '')
    .replace(/\/v1$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/+$/, '');
  if (/\/xais$/i.test(trimmed)) return trimmed;
  if (/xais\.dchai\.cn$/i.test(trimmed)) return `${trimmed}/xais`;
  return trimmed;
};

const normalizeAoduoEndpoint = (endpoint: string) => {
  const trimmed = (endpoint || AODUO_AI_ENDPOINT_DEFAULT).trim().replace(/\/+$/, '');
  if (/\/v1(?:\/|$)/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
};

const postJsonViaTauri = async (url: string, apiKey: string, body: unknown) => {
  try {
    return await invoke<unknown>('post_ai_json', {
      url,
      apiKey,
      body,
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const postTextViaTauri = async (url: string, apiKey: string, body: unknown) => {
  try {
    return await invoke<string>('post_ai_text', {
      url,
      apiKey,
      body,
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
    images: string[];
  },
) => {
  try {
    return await invoke<unknown>('post_ai_image_edit', {
      url,
      apiKey,
      ...payload,
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const getJsonViaTauri = async (url: string, apiKey: string) => {
  try {
    return await invoke<unknown>('get_ai_json', {
      url,
      apiKey,
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const getTextViaTauri = async (url: string, apiKey: string) => {
  try {
    return await invoke<string>('get_ai_text', {
      url,
      apiKey,
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

const gptImage2SizeFromAspectRatio = (aspectRatio?: string, resolution?: string) => {
  const isHighResolution = resolution === '4k';
  switch (aspectRatio) {
    case '9:16': return isHighResolution ? '2160x3840' : '1088x1920';
    case '16:9': return isHighResolution ? '3840x2160' : '1920x1088';
    case '3:4': return isHighResolution ? '2400x3200' : '960x1280';
    case '4:3': return isHighResolution ? '3200x2400' : '1280x960';
    default: return isHighResolution ? '2880x2880' : '1024x1024';
  }
};

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

const parseAiResponseText = (text: string): unknown => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return trimmed;
  }
};

const getTaskIdFromResponse = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim().replace(/^"+|"+$/g, '');
  }
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const direct = record.task_id || record.taskId || record.id || record.data || record.result;
  if (typeof direct === 'string' || typeof direct === 'number') return String(direct).trim();
  if (Array.isArray(record.data)) {
    for (const item of record.data) {
      const nested = getTaskIdFromResponse(item);
      if (nested) return nested;
    }
  }
  return '';
};

const delay = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const getTextViaTauriWithRetry = async (
  url: string,
  apiKey: string,
  label: string,
  attempts = 4,
  delayMs = 1400
) => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getTextViaTauri(url, apiKey);
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
  const normalized = String(model || '').trim();
  return /^(?:image2|img2)(?:[\s_-]|$)/i.test(normalized)
    || /^xais[\s_-]?(?:image2|img2)(?:[\s_-]|$)/i.test(normalized);
};

const collectXaisAttachmentIds = (value: unknown, output: string[] = [], trusted = false): string[] => {
  const pushAttachment = (raw: unknown) => {
    const text = String(raw || '').trim().replace(/^"+|"+$/g, '');
    if (!text || /^https?:\/\//i.test(text) || /^data:image\//i.test(text) || text.length > 512) return;
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
      const isAttachmentKey = /^(result|results|att|atts|attachment|attachments|output|outputs|file|files)$/i.test(key);
      collectXaisAttachmentIds(nested, output, trusted || isAttachmentKey);
    });
  }

  return Array.from(new Set(output));
};

const resolveXaisAttachmentUrls = async (endpoint: string, apiKey: string, attachments: string[]) => {
  const images: string[] = [];
  for (const att of Array.from(new Set(attachments.filter(Boolean)))) {
    const raw = await getTextViaTauriWithRetry(
      `${endpoint}/attUrls?att=${encodeURIComponent(att)}`,
      apiKey,
      'Xais 结果链接解析'
    );
    const parsed = parseAiResponseText(raw);
    const parsedImages = collectImageStrings(parsed);
    if (parsedImages.length > 0) {
      images.push(...parsedImages);
      continue;
    }
    const directUrl = String(raw || '').trim();
    if (/^https?:\/\//i.test(directUrl)) images.push(directUrl);
  }
  return Array.from(new Set(images));
};

const generateXaisWorkerTaskImages = async (options: CanvasAiImageOptions, count: number) => {
  const apiKey = options.apiKey.trim();
  const prompt = options.prompt.trim();
  if (!apiKey) throw new Error('请先填写 Xais API Key');
  if (!prompt) throw new Error('请输入生图提示词');

  const model = (options.model || XAIS_CHAT_IMAGE_MODEL_DEFAULT).trim();
  const endpoint = normalizeXaisWorkerEndpoint(options.endpoint || '');
  const requestCount = Math.max(1, Math.min(4, count));
  const inputImages = (options.inputImages || []).filter(Boolean).slice(0, 8);
  const promptText = buildChinesePromptWithOptions(prompt, options.aspectRatio);
  const output: string[] = [];

  const runOneTask = async () => {
    const customField: Record<string, unknown> = {
      outputFormat: outputMimeFromFormat(options.outputFormat),
      prompt: promptText,
      input: promptText,
    };
    if (options.aspectRatio) customField.aspectRatio = options.aspectRatio;
    if (inputImages.length > 0) {
      customField.imageUrls = inputImages;
      customField.image_urls = inputImages;
      customField.referenceImages = inputImages;
      customField.reference_images = inputImages;
      customField.images = inputImages;
    }

    const startedRaw = await postTextViaTauri(`${endpoint}/workerTaskStart`, apiKey, {
      model,
      prompt: promptText,
      custom_field: customField,
    });
    const started = parseAiResponseText(startedRaw);
    const immediateImages = collectImageStrings(started);
    if (immediateImages.length > 0) return immediateImages;

    const taskId = getTaskIdFromResponse(started);
    if (!taskId) {
      throw new Error(`Xais ${model} 没有返回任务 ID：${String(startedRaw).slice(0, 180)}`);
    }

    let lastWait: unknown = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) await delay(1800);
      const waitedRaw = await getTextViaTauriWithRetry(
        `${endpoint}/workerTaskWait?json=1&id=${encodeURIComponent(taskId)}`,
        apiKey,
        `Xais ${model} 任务等待`
      );
      const waited = parseAiResponseText(waitedRaw);
      lastWait = waited;
      const waitedImages = collectImageStrings(waited);
      if (waitedImages.length > 0) return waitedImages;

      const attachments = collectXaisAttachmentIds(waited);
      if (attachments.length > 0) {
        const urls = await resolveXaisAttachmentUrls(endpoint, apiKey, attachments);
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

const generateOpenAiCompatibleImages = async (options: CanvasAiImageOptions) => {
  const apiKey = options.apiKey.trim();
  const prompt = options.prompt.trim();
  if (!apiKey) throw new Error('请先填写 API Key');
  if (!prompt) throw new Error('请输入生图提示词');

  const inputImages = (options.inputImages || []).filter(Boolean).slice(0, 8);
  const model = (options.model || OPENAI_COMPATIBLE_IMAGE_MODEL_DEFAULT).trim();
  const count = Math.max(1, Math.min(4, Math.round(options.count || 1)));
  const size = imageSizeFromAspectRatio(options.aspectRatio);

  if (inputImages.length > 0) {
    const data = await postImageEditViaTauri(normalizeOpenAiEndpoint(options.endpoint || '', 'images/edits'), apiKey, {
      model,
      prompt: buildPromptWithOptions(prompt, options.aspectRatio, options.resolution),
      n: count,
      size,
      images: inputImages,
    });
    const images = Array.from(new Set(collectImageStrings(data)));
    if (images.length > 0) return images.slice(0, count);
  }

  const data = await postJsonViaTauri(normalizeOpenAiEndpoint(options.endpoint || '', 'images/generations'), apiKey, {
    model,
    prompt: buildPromptWithOptions(prompt, options.aspectRatio, options.resolution),
    n: count,
    size,
    response_format: 'b64_json',
  });
  const images = Array.from(new Set(collectImageStrings(data)));
  if (images.length === 0) throw new Error('接口没有返回图片数据');
  return images.slice(0, count);
};

const generateXaisChatImages = async (options: CanvasAiImageOptions) => {
  const apiKey = options.apiKey.trim();
  const prompt = options.prompt.trim();
  if (!apiKey) throw new Error('请先填写 Xais API Key');
  if (!prompt) throw new Error('请输入生图提示词');

  const model = (options.model || XAIS_CHAT_IMAGE_MODEL_DEFAULT).trim() || XAIS_CHAT_IMAGE_MODEL_DEFAULT;
  const count = Math.max(1, Math.min(4, Math.round(options.count || 1)));
  if (isXaisWorkerTaskModel(model)) {
    return generateXaisWorkerTaskImages({ ...options, model }, count);
  }
  const inputImages = (options.inputImages || []).filter(Boolean).slice(0, 8);
  const promptText = buildChinesePromptWithOptions(prompt, options.aspectRatio, options.resolution);
  const imageEndpoint = normalizeImageGenerationsEndpoint(options.endpoint || '');
  const chatEndpoint = normalizeChatCompletionsEndpoint(options.endpoint || '');
  const requestImages = async (label: string, url: string, body: unknown, repeatCount: number) => {
    const output: string[] = [];
    let lastError: unknown = null;
    for (let index = 0; index < repeatCount && Array.from(new Set(output)).length < repeatCount; index += 1) {
      try {
        const data = await postJsonViaTauri(url, apiKey, body);
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
        model,
        prompt: promptText,
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
  const urlTextContent = inputImages.length > 0
    ? `${promptText}\n\n参考图片 URL：\n${inputImages.join('\n')}`
    : promptText;
  const chatBodies = [
    {
      label: 'Xais Chat 接口',
      body: {
        model,
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
    ...(inputImages.length > 0 ? [{
      label: 'Xais Chat URL 文本接口',
      body: {
        model,
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

const generateAoduoChatImages = async (options: CanvasAiImageOptions, count: number) => {
  const apiKey = options.apiKey.trim();
  const model = (options.model || AODUO_AI_IMAGE_MODEL_DEFAULT).trim() || AODUO_AI_IMAGE_MODEL_DEFAULT;
  const inputImages = (options.inputImages || []).filter(Boolean).slice(0, 8);
  const promptText = buildChinesePromptWithOptions(options.prompt, options.aspectRatio, options.resolution);
  const content = inputImages.length > 0
    ? [
      { type: 'text', text: promptText },
      ...inputImages.map(image => ({
        type: 'image_url',
        image_url: { url: image },
      })),
    ]
    : promptText;
  const body = {
    model,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
    stream: false,
  };
  const url = normalizeChatCompletionsEndpoint(normalizeAoduoEndpoint(options.endpoint || ''));
  const images: string[] = [];
  let lastError: unknown = null;

  for (let index = 0; index < count && Array.from(new Set(images)).length < count; index += 1) {
    try {
      const data = await postJsonViaTauri(url, apiKey, body);
      images.push(...collectImageStrings(data));
    } catch (error) {
      lastError = error;
      if (images.length > 0) break;
      throw error;
    }
  }

  const uniqueImages = Array.from(new Set(images));
  if (uniqueImages.length === 0) {
    throw new Error(lastError ? getErrorMessage(lastError) : '中转2 chat 接口没有返回图片数据');
  }
  return uniqueImages.slice(0, count);
};

const generateAoduoGptImage2Images = async (options: CanvasAiImageOptions, count: number) => {
  const apiKey = options.apiKey.trim();
  const prompt = options.prompt.trim();
  const model = (options.model || AODUO_AI_GPT_IMAGE_2_MODEL).trim();
  const modelLabel = model === AODUO_AI_GPT_IMAGE_2_GUAN_MODEL ? 'GPT Image 2 官转' : 'GPT Image 2';
  const endpoint = normalizeAoduoEndpoint(options.endpoint || '');
  const generateUrl = `${endpoint}/media/generate`;
  const statusUrl = `${endpoint}/media/status`;
  const requestCount = Math.max(1, Math.min(4, count));
  const body = {
    ...(model === AODUO_AI_GPT_IMAGE_2_MODEL ? { background: 'opaque' } : {}),
    model,
    n: requestCount,
    prompt: buildPromptWithOptions(prompt, options.aspectRatio, options.resolution),
    quality: options.resolution === '4k' ? 'high' : 'auto',
    size: gptImage2SizeFromAspectRatio(options.aspectRatio, options.resolution),
  };

  const created = await postJsonViaTauri(generateUrl, apiKey, body);
  const immediateImages = Array.from(new Set(collectImageStrings(created)));
  if (immediateImages.length > 0) return immediateImages.slice(0, requestCount);

  const taskId = getTaskIdFromResponse(created);
  if (!taskId) {
    throw new Error(`${modelLabel} 没有返回图片或 task_id`);
  }

  let lastStatus: unknown = null;
  for (let attempt = 0; attempt < 36; attempt += 1) {
    if (attempt > 0) await delay(3500);
    const status = await getJsonViaTauri(`${statusUrl}?task_id=${encodeURIComponent(taskId)}`, apiKey);
    lastStatus = status;
    const record = status && typeof status === 'object' ? status as Record<string, unknown> : {};
    const images = Array.from(new Set(collectImageStrings(status)));
    if (record.state === 'failed') {
      throw new Error(getErrorMessage(record.error) || `${modelLabel} 任务失败`);
    }
    if (record.is_final === true) {
      if (record.state === 'success' && images.length > 0) return images.slice(0, requestCount);
      throw new Error(getErrorMessage(record.error) || `${modelLabel} 任务结束但没有返回图片`);
    }
  }

  throw new Error(`${modelLabel} 任务超时：${getErrorMessage(lastStatus)}`);
};

const generateAoduoImages = async (options: CanvasAiImageOptions) => {
  const apiKey = options.apiKey.trim();
  const prompt = options.prompt.trim();
  if (!apiKey) throw new Error('请先填写中转2 API Key');
  if (!prompt) throw new Error('请输入生图提示词');

  const endpoint = normalizeAoduoEndpoint(options.endpoint || '');
  const model = (options.model || AODUO_AI_IMAGE_MODEL_DEFAULT).trim() || AODUO_AI_IMAGE_MODEL_DEFAULT;
  const count = Math.max(1, Math.min(4, Math.round(options.count || 1)));
  const inputImages = (options.inputImages || []).filter(Boolean).slice(0, 8);
  const size = imageSizeFromAspectRatio(options.aspectRatio);

  if (model === AODUO_AI_GPT_IMAGE_2_MODEL || model === AODUO_AI_GPT_IMAGE_2_GUAN_MODEL) {
    if (inputImages.length > 0) {
      throw new Error(`${model === AODUO_AI_GPT_IMAGE_2_GUAN_MODEL ? 'GPT Image 2 官转' : 'GPT Image 2'} 当前仅接入文生图；图生图需要公开可访问的图片 URL 后再接入`);
    }
    return generateAoduoGptImage2Images({ ...options, endpoint, model }, count);
  }

  if (inputImages.length > 0) {
    if (inputImages.every(isRemoteHttpImageSource)) {
      return generateAoduoChatImages({ ...options, endpoint, model, inputImages }, count);
    }
    throw new Error('中转2 图生图需要公网图片 URL，本地图片不能直接用 base64 或 multipart 上传');
  }

  try {
    const data = await postJsonViaTauri(normalizeOpenAiEndpoint(endpoint, 'images/generations'), apiKey, {
      model,
      prompt: buildPromptWithOptions(prompt, options.aspectRatio, options.resolution),
      n: count,
      size,
      response_format: 'b64_json',
    });
    const images = Array.from(new Set(collectImageStrings(data)));
    if (images.length > 0) return images.slice(0, count);
    throw new Error('Images 接口没有返回图片数据');
  } catch (openAiError) {
    try {
      return await generateAoduoChatImages({ ...options, endpoint, model, inputImages }, count);
    } catch (chatError) {
      throw new Error(`中转2 调用失败：Images 接口 ${getErrorMessage(openAiError)}；Chat 接口 ${getErrorMessage(chatError)}`);
    }
  }
};

export const generateCanvasAiProviderImages = async (options: CanvasAiImageOptions): Promise<string[]> => {
  if (options.provider === 'xais-chat') return generateXaisChatImages(options);
  if (options.provider === 'aoduo-ai') return generateAoduoImages(options);
  return generateOpenAiCompatibleImages(options);
};
