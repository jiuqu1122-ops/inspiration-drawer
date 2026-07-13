const decodeHtmlEntities = (value: string) => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
};

const normalizeDraggedUrl = (value: string) => {
  const firstLine = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || '';
  if (!firstLine) return '';
  return decodeHtmlEntities(firstLine).replace(/^['"]|['"]$/g, '').trim();
};

const extractImageUrlFromHtml = (html: string) => {
  if (!html) return '';
  const imgSrc = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  if (imgSrc) return normalizeDraggedUrl(imgSrc);
  const anyUrl = html.match(/https?:\/\/[^"'<>\s]+/i)?.[0];
  return anyUrl ? normalizeDraggedUrl(anyUrl) : '';
};

const getNameFromUrl = (url: string) => {
  if (url.startsWith('data:image/')) return `网页图片_${Date.now()}.png`;
  try {
    const parsed = new URL(url);
    const rawName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '网页图片');
    const ext = getFileExtension(rawName);
    if (ext && isSupportedImageExtension(ext)) return rawName;
    if (isLikelyImageEndpointUrl(url)) return `网页图片_${Date.now()}`;
    return rawName && !rawName.includes('.') ? `${rawName}_${Date.now()}` : `网页图片_${Date.now()}`;
  } catch (_) {
    return `网页图片_${Date.now()}`;
  }
};

const isProbablyUrl = (value?: string | null) => /^https?:\/\/\S+$/i.test((value || '').trim());

const getFileExtension = (value?: string | null) => {
  const clean = (value || '').split('?')[0].split('#')[0];
  const name = clean.split(/[/\\]/).pop() || '';
  const ext = name.includes('.') ? name.split('.').pop() || '' : '';
  return ext.toLowerCase();
};

const isSupportedImageExtension = (ext: string) => (
  ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(ext.toLowerCase())
);

const isLikelyImageEndpointUrl = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const query = parsed.search.toLowerCase();
    if ((host === 'mm.bing.net' || host.endsWith('.mm.bing.net'))
      && (path.includes('/th/id/') || query.includes('pid=imgdetmain'))) {
      return true;
    }
    if (host === 'huabanimg.com' || host.endsWith('.huabanimg.com') || host.includes('hbimg')) {
      return true;
    }
    if ((host === 'huaban.com' || host.endsWith('.huaban.com')) && /^\/pins\/\d+(?:\/)?$/i.test(path)) {
      return true;
    }
    return query.includes('imgurl=')
      || query.includes('mediaurl=')
      || query.includes('imageurl=')
      || query.includes('thumbnail=')
      || /\/(?:image|images|img|thumb|thumbnail)\//i.test(path);
  } catch (_) {
    return false;
  }
};

const getWebImageFromDataTransfer = (dt?: DataTransfer | null) => {

  if (!dt) return null;

  const downloadUrl = dt.getData('DownloadURL');
  if (downloadUrl) {
    const parts = downloadUrl.split(':');
    const url = parts.slice(2).join(':');
    const name = parts[1] || getNameFromUrl(url);
    if (url) return { url: normalizeDraggedUrl(url), name };
  }

  const htmlUrl = extractImageUrlFromHtml(dt.getData('text/html'));
  if (htmlUrl) return { url: htmlUrl, name: getNameFromUrl(htmlUrl) };

  const uriUrl = normalizeDraggedUrl(dt.getData('text/uri-list'));
  if (uriUrl) return { url: uriUrl, name: getNameFromUrl(uriUrl) };

  const mozUrl = normalizeDraggedUrl(dt.getData('text/x-moz-url'));
  if (mozUrl) return { url: mozUrl, name: getNameFromUrl(mozUrl) };

  const plainUrl = normalizeDraggedUrl(dt.getData('text/plain'));
  if (/^(https?:|data:image\/)/i.test(plainUrl)) {
    return { url: plainUrl, name: getNameFromUrl(plainUrl) };
  }

  return null;
};

export {
  decodeHtmlEntities,
  normalizeDraggedUrl,
  extractImageUrlFromHtml,
  getNameFromUrl,
  isProbablyUrl,
  getFileExtension,
  isLikelyImageEndpointUrl,
  getWebImageFromDataTransfer,
};
