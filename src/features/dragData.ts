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
    return rawName.includes('.') ? rawName : `${rawName || '网页图片'}_${Date.now()}`;
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
  getWebImageFromDataTransfer,
};
