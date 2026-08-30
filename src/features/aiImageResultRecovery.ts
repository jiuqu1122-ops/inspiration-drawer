const AI_IMAGE_RESULT_API_HOST = 'api.unmind.art';
const GENERATED_IMAGE_OSS_HOST = 'inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com';
const GENERATED_VIDEO_OSS_HOST = GENERATED_IMAGE_OSS_HOST;
const RESULT_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

function resultKeyFromPath(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return '';
  try {
    const key = decodeURIComponent(pathname.slice(prefix.length));
    return RESULT_KEY_PATTERN.test(key) ? key : '';
  } catch {
    return '';
  }
}

function getStableAiResultSource(
  value: string | null | undefined,
  apiPrefix: string,
  ossPrefix: string,
  ossHost: string,
) {
  const source = String(value || '').trim();
  if (!source) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const apiKey = host === AI_IMAGE_RESULT_API_HOST
      ? resultKeyFromPath(url.pathname, apiPrefix)
      : '';
    if (apiKey) {
      return `https://${AI_IMAGE_RESULT_API_HOST}${apiPrefix}${apiKey}`;
    }
    const ossKey = host === ossHost
      ? resultKeyFromPath(url.pathname, ossPrefix)
      : '';
    if (ossKey) {
      return `https://${AI_IMAGE_RESULT_API_HOST}${apiPrefix}${ossKey}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function getStableAiImageResultSource(value?: string | null) {
  return getStableAiResultSource(
    value,
    '/v1/ai/image-results/',
    '/generated-images/',
    GENERATED_IMAGE_OSS_HOST,
  );
}

export function getStableAiVideoResultSource(value?: string | null) {
  return getStableAiResultSource(
    value,
    '/v1/ai/video-results/',
    '/generated-videos/',
    GENERATED_VIDEO_OSS_HOST,
  );
}

export function getDurableAiMediaSource(input: {
  originalUrl?: string | null;
  sourceUrl?: string | null;
  url?: string | null;
  content?: string | null;
}) {
  const candidates = [input.originalUrl, input.sourceUrl, input.url, input.content]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    const stableSource = getStableAiImageResultSource(candidate)
      || getStableAiVideoResultSource(candidate);
    if (stableSource) return stableSource;
  }
  return candidates[0] || '';
}

export function getAutoRecoverableAiMediaResultSource(input: {
  mediaType?: string | null;
  status?: string | null;
  cacheStatus?: string | null;
  path?: string | null;
  source?: string | null;
}) {
  if ((input.mediaType !== 'image' && input.mediaType !== 'video')
    || input.status !== 'success'
    || input.cacheStatus === 'pending'
    || (input.path && input.cacheStatus !== 'failed')) {
    return null;
  }
  return input.mediaType === 'video'
    ? getStableAiVideoResultSource(input.source)
    : getStableAiImageResultSource(input.source);
}

export function getAutoRecoverableAiImageResultSource(input: {
  mediaType?: string | null;
  status?: string | null;
  cacheStatus?: string | null;
  path?: string | null;
  source?: string | null;
}) {
  if (input.mediaType !== 'image') return null;
  return getAutoRecoverableAiMediaResultSource(input);
}
