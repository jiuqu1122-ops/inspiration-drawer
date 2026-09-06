import {
  CANVAS_AI_INPUT_IMAGE_MAX_EDGE,
  CANVAS_AI_INPUT_IMAGE_MIN_EDGE,
  CANVAS_AI_INPUT_IMAGE_MIN_QUALITY,
  CANVAS_AI_INPUT_IMAGE_QUALITY,
  CANVAS_AI_INPUT_IMAGE_TARGET_BYTES,
} from './canvasAiConfig';

export const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
  reader.readAsDataURL(blob);
});

export const isRemoteHttpImageSource = (source?: string | null) => {
  const value = String(source || '').trim();
  return /^https?:\/\//i.test(value) && !/asset\.localhost|localhost|127\.0\.0\.1/i.test(value);
};

export const getCanvasAiRemoteFallbackForRotation = (
  remoteFallback: string | undefined,
  rotation: 0 | 90 | 180 | 270,
) => rotation === 0 ? remoteFallback : undefined;

export const isLikelyJpegOrPngImageSource = (source?: string | null) => {
  const value = String(source || '').trim();
  return /^data:image\/(?:png|jpe?g);base64,/i.test(value)
    || /\.(?:png|jpe?g)(?:[?#].*)?$/i.test(value);
};

export const isXaisAttachmentImageRef = (source?: string | null) => {
  const value = String(source || '').trim();
  return value.length > 0
    && value.length <= 512
    && !/^(?:https?:|data:|asset:|file:)/i.test(value)
    && !/^[a-zA-Z]:[\\/]/.test(value)
    && !/^\\\\/.test(value)
    && /^[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp)$/i.test(value);
};

export const getDataUrlByteSize = (dataUrl: string) => {
  const commaIndex = dataUrl.indexOf(',');
  const payload = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Math.ceil(payload.length * 0.75);
};

export const optimizeCanvasAiInputDataUrl = (
  dataUrl: string,
  options?: { maxEdge?: number; targetBytes?: number },
) => new Promise<string>((resolve) => {
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUrl)) {
    resolve(dataUrl);
    return;
  }
  const image = new window.Image();
  image.onload = () => {
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) {
      resolve(dataUrl);
      return;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(dataUrl);
      return;
    }

    const originalBytes = getDataUrlByteSize(dataUrl);
    const candidates: string[] = [];
    const requestedMaxEdge = Math.max(1, Number(options?.maxEdge) || CANVAS_AI_INPUT_IMAGE_MAX_EDGE);
    const targetBytes = Math.max(1, Number(options?.targetBytes) || CANVAS_AI_INPUT_IMAGE_TARGET_BYTES);
    const maxEdges = options?.maxEdge
      ? Array.from(new Set([
          Math.min(requestedMaxEdge, Math.max(naturalWidth, naturalHeight)),
          Math.min(640, requestedMaxEdge),
        ])).filter(edge => edge > 0)
      : Array.from(new Set([
          Math.min(CANVAS_AI_INPUT_IMAGE_MAX_EDGE, Math.max(naturalWidth, naturalHeight)),
          1120,
          CANVAS_AI_INPUT_IMAGE_MIN_EDGE,
        ])).filter(edge => edge > 0);
    const qualities = Array.from(new Set([
      CANVAS_AI_INPUT_IMAGE_QUALITY,
      0.76,
      CANVAS_AI_INPUT_IMAGE_MIN_QUALITY,
    ]));

    for (const maxEdge of maxEdges) {
      const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, width, height);

      for (const quality of qualities) {
        const candidate = canvas.toDataURL('image/jpeg', quality);
        if (!candidate) continue;
        candidates.push(candidate);
        if (getDataUrlByteSize(candidate) <= targetBytes) {
          canvas.width = 0;
          canvas.height = 0;
          resolve(candidate);
          return;
        }
      }
    }

    canvas.width = 0;
    canvas.height = 0;
    const smallestCandidate = candidates.reduce((best, candidate) => (
      getDataUrlByteSize(candidate) < getDataUrlByteSize(best) ? candidate : best
    ), candidates[0] || dataUrl);
    resolve(getDataUrlByteSize(smallestCandidate) < originalBytes ? smallestCandidate : dataUrl);
  };
  image.onerror = () => resolve(dataUrl);
  image.src = dataUrl;
});

export const imageDataUrlToJpegDataUrl = (dataUrl: string) => new Promise<string>((resolve, reject) => {
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUrl)) {
    reject(new Error('invalid image data url'));
    return;
  }
  const image = new window.Image();
  image.onload = () => {
    try {
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      if (!naturalWidth || !naturalHeight) {
        reject(new Error('empty image'));
        return;
      }
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas context unavailable'));
        return;
      }

      const candidates: string[] = [];
      const maxEdges = Array.from(new Set([
        Math.min(CANVAS_AI_INPUT_IMAGE_MAX_EDGE, Math.max(naturalWidth, naturalHeight)),
        1600,
        CANVAS_AI_INPUT_IMAGE_MIN_EDGE,
      ])).filter(edge => edge > 0);
      const qualities = Array.from(new Set([
        CANVAS_AI_INPUT_IMAGE_QUALITY,
        0.84,
        CANVAS_AI_INPUT_IMAGE_MIN_QUALITY,
        0.76,
      ]));

      for (const maxEdge of maxEdges) {
        const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        canvas.width = width;
        canvas.height = height;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, width, height);

        for (const quality of qualities) {
          const candidate = canvas.toDataURL('image/jpeg', quality);
          if (!candidate) continue;
          candidates.push(candidate);
          if (getDataUrlByteSize(candidate) <= CANVAS_AI_INPUT_IMAGE_TARGET_BYTES) {
            canvas.width = 0;
            canvas.height = 0;
            resolve(candidate);
            return;
          }
        }
      }

      canvas.width = 0;
      canvas.height = 0;
      const smallestCandidate = candidates.reduce((best, candidate) => (
        getDataUrlByteSize(candidate) < getDataUrlByteSize(best) ? candidate : best
      ), candidates[0] || '');
      if (smallestCandidate) {
        resolve(smallestCandidate);
      } else {
        reject(new Error('jpeg conversion failed'));
      }
    } catch (err) {
      reject(err);
    }
  };
  image.onerror = () => reject(new Error('image decode failed'));
  image.decoding = 'async';
  image.src = dataUrl;
});

export const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return await response.blob();
};

export const imageDataUrlToPngDataUrl = async (dataUrl: string) => {
  if (/^data:image\/png;base64,/i.test(dataUrl)) return dataUrl;
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUrl)) {
    throw new Error('invalid image data url');
  }

  return await new Promise<string>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) {
          reject(new Error('empty image'));
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas context unavailable'));
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
        canvas.width = 0;
        canvas.height = 0;
      } catch (err) {
        reject(err);
      }
    };
    image.onerror = () => reject(new Error('image decode failed'));
    image.decoding = 'async';
    image.src = dataUrl;
  });
};

export const rotateImageDataUrl = (
  dataUrl: string,
  rotation: 0 | 90 | 180 | 270,
) => new Promise<string>((resolve, reject) => {
  if (rotation === 0) {
    resolve(dataUrl);
    return;
  }
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUrl)) {
    reject(new Error('invalid image data url'));
    return;
  }
  const image = new window.Image();
  image.onload = () => {
    try {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) throw new Error('empty image');
      const swapsAxes = rotation === 90 || rotation === 270;
      const canvas = document.createElement('canvas');
      canvas.width = swapsAxes ? sourceHeight : sourceWidth;
      canvas.height = swapsAxes ? sourceWidth : sourceHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas context unavailable');
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(rotation * Math.PI / 180);
      context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
      const rotated = canvas.toDataURL('image/png');
      canvas.width = 0;
      canvas.height = 0;
      resolve(rotated);
    } catch (error) {
      reject(error);
    }
  };
  image.onerror = () => reject(new Error('image decode failed'));
  image.decoding = 'async';
  image.src = dataUrl;
});
