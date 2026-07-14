const decodeHtmlEntities = (value: string) => {
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  }

  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    const radix = lower.startsWith('#x') ? 16 : 10;
    const rawCodePoint = lower.replace(/^#x?/, '');
    const codePoint = Number.parseInt(rawCodePoint, radix);
    if (!Number.isFinite(codePoint)) return match;
    try {
      return String.fromCodePoint(codePoint);
    } catch (_) {
      return match;
    }
  });
};

const decodeUrlComponentLoose = (value: string) => {
  let current = value.trim();
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch (_) {
      break;
    }
  }
  return current;
};

const normalizeDraggedUrl = (value: string) => {
  const firstLine = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || '';
  if (!firstLine) return '';
  let normalized = decodeHtmlEntities(firstLine).replace(/^['"]|['"]$/g, '').trim();
  if (/^https?%/i.test(normalized)) {
    normalized = decodeUrlComponentLoose(normalized)
      .replace(/&(os|pd|pi|pn|rn|simid|tn|width|word|z)=.*$/i, '');
  }
  return extractNestedImageUrl(normalized) || normalized;
};

type ImageUrlCandidate = {
  value: string;
  priority: number;
  order: number;
};

const HTML_IMAGE_ATTRIBUTE_PRIORITIES: Record<string, number> = {
  'data-objurl': 120,
  objurl: 120,
  'data-imgurl': 115,
  imgurl: 115,
  'data-image-url': 115,
  imageurl: 115,
  'data-original': 110,
  'data-original-src': 110,
  'data-hover-url': 105,
  'hover-url': 105,
  'data-middle-url': 105,
  'middle-url': 105,
  'data-lazy-src': 90,
  'data-src': 85,
  'data-srcset': 80,
  srcset: 80,
  src: 75,
  'data-thumburl': 65,
  thumburl: 65,
  'data-thumbnail': 65,
  thumbnail: 65,
  href: 10,
};

const JSON_IMAGE_KEY_PRIORITIES: Record<string, number> = {
  objurl: 120,
  imgurl: 115,
  imageurl: 115,
  original: 110,
  originalurl: 110,
  hoverurl: 105,
  middleurl: 105,
  replaceurl: 100,
  src: 75,
  thumburl: 65,
  thumbnail: 65,
};

const decodeClipboardEscapes = (value: string) => {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    const decoded = current
      .replace(/\\u003a/gi, ':')
      .replace(/\\u002f/gi, '/')
      .replace(/\\u0026/gi, '&')
      .replace(/\\u003d/gi, '=')
      .replace(/\\u003f/gi, '?')
      .replace(/\\u0025/gi, '%')
      .replace(/\\u0023/gi, '#')
      .replace(/\\\//g, '/')
      .replace(/\\(["'])/g, '$1');
    if (decoded === current) break;
    current = decoded;
  }
  return current;
};

const normalizeImageUrlCandidate = (value: string) => {
  let normalized = decodeClipboardEscapes(decodeHtmlEntities(value))
    .trim()
    .replace(/^[\s'"([{]+/, '')
    .replace(/[\\\s'"\])},;]+$/, '');
  if (/^https?%/i.test(normalized)) {
    normalized = decodeUrlComponentLoose(normalized)
      .replace(/&(os|pd|pi|pn|rn|simid|tn|width|word|z)=.*$/i, '');
  }
  if (normalized.startsWith('//')) normalized = `https:${normalized}`;
  if (/^data:image\//i.test(normalized)) return normalized;
  if (!/^https?:\/\//i.test(normalized)) return '';
  return normalizeDraggedUrl(normalized);
};

const isBaiduSearchPageUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase() === 'image.baidu.com'
      && /^\/search\/(?:index|detail)(?:\/|$)/i.test(parsed.pathname);
  } catch (_) {
    return false;
  }
};

const isBaiduImageCdnUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return /^img\d*\.baidu\.com$/i.test(parsed.hostname) && parsed.pathname.startsWith('/it/');
  } catch (_) {
    return false;
  }
};

const imageCandidateScore = (value: string, priority: number) => {
  if (!value) return Number.NEGATIVE_INFINITY;
  if (isBaiduSearchPageUrl(value)) return -10000;

  let score = priority;
  if (/^data:image\//i.test(value)) {
    if (value.length < 160 || /R0lGODlhAQABA/i.test(value)) return score - 200;
    return score + 90;
  }
  if (hasImageExtensionInValue(value)) score += 100;
  if (isLikelyImageEndpointUrl(value)) score += 80;
  if (isBaiduImageCdnUrl(value)) score += 200;
  if (/^https:\/\//i.test(value)) score += 5;
  if (/(?:blank|transparent|placeholder|loading)(?:[._/-]|$)/i.test(value)) score -= 80;
  return score;
};

const rankImageUrlCandidates = (candidates: ImageUrlCandidate[]) => {
  const bestByUrl = new Map<string, ImageUrlCandidate>();
  candidates.forEach(candidate => {
    const value = normalizeImageUrlCandidate(candidate.value);
    if (!value) return;
    const normalizedCandidate = { ...candidate, value };
    const previous = bestByUrl.get(value);
    if (!previous
      || imageCandidateScore(value, candidate.priority) > imageCandidateScore(value, previous.priority)) {
      bestByUrl.set(value, normalizedCandidate);
    }
  });

  const ranked = Array.from(bestByUrl.values()).sort((left, right) => {
    const scoreDelta = imageCandidateScore(right.value, right.priority)
      - imageCandidateScore(left.value, left.priority);
    return scoreDelta || left.order - right.order;
  });
  return ranked
    .filter(candidate => imageCandidateScore(candidate.value, candidate.priority) >= 55)
    .map(candidate => candidate.value);
};

const selectBestImageUrlCandidate = (candidates: ImageUrlCandidate[]) => {
  return rankImageUrlCandidates(candidates)[0] || '';
};

const extractSrcsetUrls = (value: string) => value
  .split(/,\s*(?=(?:https?:|data:|\/\/))/i)
  .map(entry => entry.trim().replace(/\s+\d+(?:\.\d+)?[wx]\s*$/i, ''))
  .filter(Boolean);

const collectImageUrlCandidatesFromHtml = (html: string) => {
  if (!html) return [] as ImageUrlCandidate[];
  const decodedHtml = decodeClipboardEscapes(decodeHtmlEntities(html));
  const candidates: ImageUrlCandidate[] = [];
  let order = 0;
  const push = (value: string, priority: number) => {
    if (value.trim()) candidates.push({ value, priority, order: order += 1 });
  };
  const pushAttribute = (name: string, value: string) => {
    const lowerName = name.toLowerCase();
    const priority = HTML_IMAGE_ATTRIBUTE_PRIORITIES[lowerName];
    if (priority === undefined) return;
    if (lowerName.endsWith('srcset')) {
      extractSrcsetUrls(value).forEach((url, index) => push(url, priority + index));
      return;
    }
    push(value, priority);
  };

  if (typeof DOMParser !== 'undefined') {
    try {
      const documentFragment = new DOMParser().parseFromString(decodedHtml, 'text/html');
      documentFragment.querySelectorAll('*').forEach(element => {
        Array.from(element.attributes).forEach(attribute => pushAttribute(attribute.name, attribute.value));
        const style = element.getAttribute('style') || '';
        for (const match of style.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) push(match[2], 70);
      });
    } catch (_) {
      // Clipboard HTML can contain a CF_HTML header; the regex pass below also handles fragments.
    }
  }

  const attributeNames = Object.keys(HTML_IMAGE_ATTRIBUTE_PRIORITIES)
    .sort((left, right) => right.length - left.length)
    .join('|');
  const attributePattern = new RegExp(
    `(?:^|[\\s<])(${attributeNames})(?![\\w-])\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'gi',
  );
  for (const match of decodedHtml.matchAll(attributePattern)) {
    pushAttribute(match[1], match[2] ?? match[3] ?? match[4] ?? '');
  }

  const jsonKeys = Object.keys(JSON_IMAGE_KEY_PRIORITIES).join('|');
  const jsonFieldPattern = new RegExp(
    `["']?(${jsonKeys})["']?\\s*[:=]\\s*(?:"([^"]*)"|'([^']*)')`,
    'gi',
  );
  for (const match of decodedHtml.matchAll(jsonFieldPattern)) {
    const key = match[1].toLowerCase();
    push(match[2] ?? match[3] ?? '', JSON_IMAGE_KEY_PRIORITIES[key]);
  }

  for (const match of decodedHtml.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) push(match[2], 70);
  for (const match of decodedHtml.matchAll(/(?:https?:\/\/|https?%3a%2f%2f|https?%25|data:image\/)[^\s"'<>]+/gi)) {
    push(match[0], 0);
  }
  return candidates;
};

const extractImageUrlFromHtml = (html: string) => (
  selectBestImageUrlCandidate(collectImageUrlCandidatesFromHtml(html))
);

const getImageFileFromDataTransfer = (dt?: DataTransfer | null) => {
  if (!dt) return null;
  return Array.from(dt.files || []).find(file => {
    if (file.type.toLowerCase().startsWith('image/')) return true;
    return isSupportedImageExtension(getFileExtension(file.name));
  }) || null;
};

const readImageFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    if (/^data:image\//i.test(result)) resolve(result);
    else reject(new Error('Dragged file is not an image data URL'));
  };
  reader.onerror = () => reject(reader.error || new Error('Unable to read dragged image file'));
  reader.onabort = () => reject(new Error('Reading dragged image file was aborted'));
  reader.readAsDataURL(file);
});

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

const hasImageExtensionInValue = (value?: string | null) => (
  /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:$|[/?#!&:])/i.test(String(value || '').split('#')[0])
);

const IMAGE_FORMAT_PARAM_NAMES = new Set([
  'format',
  'fmt',
  'f',
  'type',
  'mime',
  'mimetype',
  'content-type',
  'filetype',
  'ext',
]);

const NESTED_IMAGE_URL_PARAM_NAMES = new Set([
  'objurl',
  'imgurl',
  'imageurl',
  'mediaurl',
  'thumbnail',
  'thumburl',
  'picurl',
  'hoverurl',
  'middleurl',
  'originalurl',
  'replaceurl',
  'src',
]);

const hasImageFormatHint = (value?: string | null) => {
  const lower = String(value || '').toLowerCase();
  if (!lower) return false;
  if (lower.includes('image/') || lower.includes('image%2f')) return true;
  return lower
    .split(/[^a-z0-9]+/i)
    .some(token => isSupportedImageExtension(token));
};

const hasImageFormatQueryHint = (parsed: URL) => {
  for (const [rawKey, value] of parsed.searchParams.entries()) {
    const key = rawKey.toLowerCase();
    if (IMAGE_FORMAT_PARAM_NAMES.has(key) && hasImageFormatHint(value)) return true;
  }

  const looseParts = `${parsed.pathname}${parsed.search}`
    .split(/[?&;]/)
    .map(part => part.trim())
    .filter(Boolean);
  return looseParts.some(part => {
    const [rawKey, value = ''] = part.split('=');
    const key = rawKey.split('/').pop()?.toLowerCase() || rawKey.toLowerCase();
    return IMAGE_FORMAT_PARAM_NAMES.has(key) && hasImageFormatHint(value);
  });
};

const extractNestedImageUrl = (value?: string | null): string => {
  const raw = String(value || '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const parsed = new URL(raw);
    const candidates: string[] = [];
    for (const [key, paramValue] of parsed.searchParams.entries()) {
      if (!NESTED_IMAGE_URL_PARAM_NAMES.has(key.toLowerCase())) continue;
      const decoded = decodeUrlComponentLoose(paramValue).replace(/^['"]|['"]$/g, '').trim();
      if (/^https?:\/\//i.test(decoded)) candidates.push(decoded);
    }
    return candidates.find(candidate => isLikelyImageEndpointUrl(candidate) || hasImageExtensionInValue(candidate)) || '';
  } catch (_) {
    return '';
  }
};

const isLikelyImageEndpointUrl = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const query = parsed.search.toLowerCase();
    const hasFormatHint = hasImageFormatQueryHint(parsed);
    if (hasImageExtensionInValue(raw)) return true;
    if ((host === 'mm.bing.net' || host.endsWith('.mm.bing.net'))
      && (path.includes('/th/id/') || query.includes('pid=imgdetmain'))) {
      return true;
    }
    if (isBaiduImageCdnUrl(raw)) {
      return true;
    }
    if (host === 'huabanimg.com' || host.endsWith('.huabanimg.com') || host.includes('hbimg')) {
      return true;
    }
    if ((host === 'huaban.com' || host.endsWith('.huaban.com')) && /^\/pins\/\d+(?:\/)?$/i.test(path)) {
      return true;
    }
    if ((host.startsWith('img') || host.includes('.img.') || host.includes('image')) && hasFormatHint) {
      return true;
    }
    return query.includes('imgurl=')
      || query.includes('mediaurl=')
      || query.includes('imageurl=')
      || query.includes('thumbnail=')
      || hasFormatHint
      || /\/(?:image|images|img|thumb|thumbnail)\//i.test(path);
  } catch (_) {
    return false;
  }
};

const getWebImageFromDataTransfer = (dt?: DataTransfer | null) => {
  if (!dt) return null;

  const candidates: Array<ImageUrlCandidate & { name?: string }> = [];
  let order = 0;
  const push = (value: string, priority: number, name?: string) => {
    if (value.trim()) candidates.push({ value, priority, name, order: order += 1 });
  };

  const downloadUrl = dt.getData('DownloadURL');
  if (downloadUrl) {
    const parts = downloadUrl.split(':');
    const url = parts.slice(2).join(':');
    if (url) push(url, 85, parts[1] || undefined);
  }

  collectImageUrlCandidatesFromHtml(dt.getData('text/html')).forEach(candidate => {
    push(candidate.value, candidate.priority + 100);
  });

  push(dt.getData('text/uri-list'), 70);
  push(dt.getData('text/x-moz-url'), 70);
  push(dt.getData('text/plain'), 60);

  const rankedUrls = rankImageUrlCandidates(candidates);
  const selectedUrl = rankedUrls[0] || '';
  if (!selectedUrl) return null;

  const selectedCandidate = candidates
    .filter(candidate => normalizeImageUrlCandidate(candidate.value) === selectedUrl)
    .sort((left, right) => right.priority - left.priority || left.order - right.order)[0];
  return {
    url: selectedUrl,
    name: selectedCandidate?.name || getNameFromUrl(selectedUrl),
    fallbackUrls: rankedUrls.slice(1, 7),
  };
};

export {
  decodeHtmlEntities,
  normalizeDraggedUrl,
  extractImageUrlFromHtml,
  getNameFromUrl,
  isProbablyUrl,
  getFileExtension,
  isLikelyImageEndpointUrl,
  getImageFileFromDataTransfer,
  readImageFileAsDataUrl,
  getWebImageFromDataTransfer,
};
