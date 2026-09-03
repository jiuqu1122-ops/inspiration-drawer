(() => {
  const MAX_PARENT_DEPTH = 5;
  const MAX_DATA_URL_CHARS = 16 * 1024 * 1024;
  const LAZY_URL_ATTRIBUTES = [
    'data-src',
    'data-original',
    'data-lazy-src',
    'data-url',
    'data-image',
  ];
  const LAZY_SRCSET_ATTRIBUTES = ['data-srcset'];

  const isElementLike = value => Boolean(
    value
    && typeof value === 'object'
    && (value.nodeType === 1 || typeof value.tagName === 'string'),
  );

  const tagNameOf = element => String(element?.tagName || '').toUpperCase();
  const readAttribute = (element, name) => {
    if (!isElementLike(element) || typeof element.getAttribute !== 'function') return '';
    return String(element.getAttribute(name) || '').trim();
  };

  const normalizeImageUrl = (value, baseUrl = globalThis.document?.baseURI || globalThis.location?.href || '') => {
    const raw = String(value || '').trim();
    if (!raw || /^(?:javascript|file|about):/i.test(raw)) return '';
    if (/^data:image\//i.test(raw)) return raw.length <= MAX_DATA_URL_CHARS ? raw : '';
    if (/^blob:/i.test(raw)) return raw;
    try {
      const parsed = new URL(raw, baseUrl || undefined);
      return /^(?:https?:|blob:|data:image\/)/i.test(parsed.href) ? parsed.href : '';
    } catch {
      return '';
    }
  };

  const parseSrcset = (value) => {
    const input = String(value || '');
    const candidates = [];
    let index = 0;
    while (index < input.length) {
      while (index < input.length && /[\s,]/.test(input[index])) index += 1;
      if (index >= input.length) break;

      let url = '';
      const quote = input[index] === '"' || input[index] === "'" ? input[index++] : '';
      if (quote) {
        while (index < input.length && input[index] !== quote) url += input[index++];
        if (input[index] === quote) index += 1;
      } else if (input.slice(index, index + 5).toLowerCase() === 'data:') {
        while (index < input.length && !/\s/.test(input[index])) url += input[index++];
      } else {
        while (index < input.length && !/[\s,]/.test(input[index])) url += input[index++];
      }

      while (index < input.length && /\s/.test(input[index])) index += 1;
      let descriptor = '';
      while (index < input.length && input[index] !== ',') descriptor += input[index++];
      if (input[index] === ',') index += 1;
      descriptor = descriptor.trim();
      const widthMatch = descriptor.match(/(?:^|\s)(\d+)w(?:\s|$)/i);
      const densityMatch = descriptor.match(/(?:^|\s)([\d.]+)x(?:\s|$)/i);
      if (url) {
        candidates.push({
          url,
          width: widthMatch ? Number(widthMatch[1]) : 0,
          density: densityMatch ? Number(densityMatch[1]) : 0,
        });
      }
    }
    return candidates;
  };

  const selectBestSrcsetCandidate = (value, baseUrl) => {
    const candidates = parseSrcset(value)
      .map(candidate => ({ ...candidate, url: normalizeImageUrl(candidate.url, baseUrl) }))
      .filter(candidate => candidate.url);
    if (candidates.length === 0) return '';
    return candidates.reduce((best, candidate) => {
      const bestScore = best.width > 0 ? best.width * 1000 : best.density;
      const score = candidate.width > 0 ? candidate.width * 1000 : candidate.density;
      return score > bestScore ? candidate : best;
    }).url;
  };

  const extractBackgroundImageUrl = (backgroundImage, baseUrl) => {
    const input = String(backgroundImage || '');
    const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
    let match;
    while ((match = pattern.exec(input))) {
      const normalized = normalizeImageUrl(match[1] || match[2] || match[3] || '', baseUrl);
      if (normalized) return normalized;
    }
    return '';
  };

  const pageMetadata = () => ({
    pageUrl: String(globalThis.location?.href || ''),
    pageTitle: String(globalThis.document?.title || ''),
  });

  const descriptorFor = (url, sourceType, element) => {
    const normalized = normalizeImageUrl(url);
    if (!normalized) return null;
    const isData = /^data:image\//i.test(normalized);
    const isBlob = /^blob:/i.test(normalized);
    return {
      kind: isData ? 'data' : isBlob ? 'blob' : 'url',
      ...(isData ? { dataUrl: normalized } : { imageUrl: normalized }),
      ...pageMetadata(),
      imageTitle: readAttribute(element, 'title') || readAttribute(element, 'aria-label') || '',
      alt: readAttribute(element, 'alt') || '',
      width: Number(element?.naturalWidth || element?.width || 0) || 0,
      height: Number(element?.naturalHeight || element?.height || 0) || 0,
      sourceType: isData ? 'data' : isBlob ? 'blob' : sourceType,
    };
  };

  const closestPicture = (image) => {
    if (tagNameOf(image?.parentElement) === 'PICTURE') return image.parentElement;
    if (typeof image?.closest === 'function') {
      const picture = image.closest('picture');
      if (isElementLike(picture)) return picture;
    }
    return null;
  };

  const readPictureCandidate = (picture) => {
    if (!picture || typeof picture.querySelectorAll !== 'function') return '';
    const sources = Array.from(picture.querySelectorAll('source') || []);
    const candidates = [];
    for (const source of sources) {
      const srcset = readAttribute(source, 'srcset') || readAttribute(source, 'data-srcset');
      const selected = selectBestSrcsetCandidate(srcset);
      if (selected) candidates.push(selected);
    }
    return candidates[0] || '';
  };

  const resolveImageElement = (image) => {
    if (tagNameOf(image) !== 'IMG') return null;
    const picture = closestPicture(image);
    const currentSrc = normalizeImageUrl(image.currentSrc || '');
    if (currentSrc) {
      const sourceType = picture ? 'picture' : readAttribute(image, 'srcset') ? 'srcset' : 'img';
      return descriptorFor(currentSrc, sourceType, image);
    }

    const pictureCandidate = readPictureCandidate(picture);
    if (pictureCandidate) return descriptorFor(pictureCandidate, 'picture', image);

    const srcset = readAttribute(image, 'srcset');
    const srcsetCandidate = selectBestSrcsetCandidate(srcset);
    if (srcsetCandidate) return descriptorFor(srcsetCandidate, 'srcset', image);

    const src = normalizeImageUrl(readAttribute(image, 'src') || image.src || '');
    if (src) return descriptorFor(src, 'img', image);

    for (const attribute of LAZY_SRCSET_ATTRIBUTES) {
      const candidate = selectBestSrcsetCandidate(readAttribute(image, attribute));
      if (candidate) return descriptorFor(candidate, 'lazy', image);
    }
    for (const attribute of LAZY_URL_ATTRIBUTES) {
      const candidate = normalizeImageUrl(readAttribute(image, attribute));
      if (candidate) return descriptorFor(candidate, 'lazy', image);
    }
    return null;
  };

  const queryImage = (element) => {
    if (!isElementLike(element) || typeof element.querySelector !== 'function') return null;
    const image = element.querySelector('img');
    return tagNameOf(image) === 'IMG' ? image : null;
  };

  const resolveBackground = (element) => {
    if (!isElementLike(element) || typeof globalThis.getComputedStyle !== 'function') return null;
    try {
      const candidate = extractBackgroundImageUrl(globalThis.getComputedStyle(element).backgroundImage);
      return candidate ? descriptorFor(candidate, 'background', element) : null;
    } catch {
      return null;
    }
  };

  const resolveLazyElement = (element) => {
    for (const attribute of LAZY_SRCSET_ATTRIBUTES) {
      const candidate = selectBestSrcsetCandidate(readAttribute(element, attribute));
      if (candidate) return descriptorFor(candidate, 'lazy', element);
    }
    for (const attribute of LAZY_URL_ATTRIBUTES) {
      const candidate = normalizeImageUrl(readAttribute(element, attribute));
      if (candidate) return descriptorFor(candidate, 'lazy', element);
    }
    return null;
  };

  const resolveImageFromElement = (target) => {
    if (!isElementLike(target)) return null;

    const direct = resolveImageElement(target);
    if (direct) return direct;

    if (typeof target.closest === 'function') {
      const closestImage = target.closest('img');
      const closestResolved = resolveImageElement(closestImage);
      if (closestResolved) return closestResolved;
    }

    const nested = resolveImageElement(queryImage(target));
    if (nested) return nested;

    const lineage = [];
    let current = target;
    for (let depth = 0; current && depth <= MAX_PARENT_DEPTH; depth += 1) {
      lineage.push(current);
      if (depth > 0) {
        const nearby = resolveImageElement(queryImage(current));
        if (nearby) return nearby;
      }
      current = current.parentElement;
    }

    for (const element of lineage) {
      const background = resolveBackground(element);
      if (background) return background;
    }
    for (const element of lineage) {
      const lazy = resolveLazyElement(element);
      if (lazy) return lazy;
    }
    return null;
  };

  const blobToDataUrl = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('blob_read_failed'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });

  const prepareImageForTransfer = async (image) => {
    if (!image) return null;
    if (image.kind === 'data') {
      const dataUrl = String(image.dataUrl || '');
      if (!/^data:image\//i.test(dataUrl) || dataUrl.length > MAX_DATA_URL_CHARS) return null;
      if (/^data:image\/[^,]+;base64,/i.test(dataUrl)) return image;
      try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        if (!String(blob.type || '').toLowerCase().startsWith('image/')) return null;
        const encodedDataUrl = await blobToDataUrl(blob);
        if (encodedDataUrl.length > MAX_DATA_URL_CHARS) return null;
        return { ...image, dataUrl: encodedDataUrl };
      } catch {
        return null;
      }
    }
    if (image.kind !== 'blob') return image;
    try {
      const response = await fetch(image.imageUrl, { cache: 'no-store' });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!String(blob.type || '').toLowerCase().startsWith('image/') || blob.size > MAX_DATA_URL_CHARS) return null;
      const dataUrl = await blobToDataUrl(blob);
      if (!/^data:image\//i.test(dataUrl) || dataUrl.length > MAX_DATA_URL_CHARS) return null;
      const { imageUrl: _privateBlobUrl, ...metadata } = image;
      return { ...metadata, kind: 'blob', dataUrl, sourceType: 'blob' };
    } catch {
      return null;
    }
  };

  globalThis.InspirationImageResolver = Object.freeze({
    MAX_DATA_URL_CHARS,
    extractBackgroundImageUrl,
    normalizeImageUrl,
    parseSrcset,
    prepareImageForTransfer,
    resolveImageFromElement,
    selectBestSrcsetCandidate,
  });
})();
