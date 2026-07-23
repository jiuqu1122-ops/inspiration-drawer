const AI_IMAGE_RESULT_API_HOST = 'api.unmind.art';
const GENERATED_IMAGE_OSS_HOST = 'inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com';
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

export function getStableAiImageResultSource(value?: string | null) {
  const source = String(value || '').trim();
  if (!source) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const apiKey = host === AI_IMAGE_RESULT_API_HOST
      ? resultKeyFromPath(url.pathname, '/v1/ai/image-results/')
      : '';
    if (apiKey) {
      return `https://${AI_IMAGE_RESULT_API_HOST}/v1/ai/image-results/${apiKey}`;
    }
    const ossKey = host === GENERATED_IMAGE_OSS_HOST
      ? resultKeyFromPath(url.pathname, '/generated-images/')
      : '';
    if (ossKey) {
      return `https://${AI_IMAGE_RESULT_API_HOST}/v1/ai/image-results/${ossKey}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function getAutoRecoverableAiImageResultSource(input: {
  mediaType?: string | null;
  status?: string | null;
  cacheStatus?: string | null;
  path?: string | null;
  source?: string | null;
}) {
  if (input.mediaType !== 'image'
    || input.status !== 'success'
    || input.cacheStatus === 'pending'
    || (input.path && input.cacheStatus !== 'failed')) {
    return null;
  }
  return getStableAiImageResultSource(input.source);
}
