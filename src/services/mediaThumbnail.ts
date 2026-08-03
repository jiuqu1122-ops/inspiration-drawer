import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { normalizeLocalDragPath } from '../utils/localMediaPaths';

const IMAGE_THUMBNAIL_MAX_WIDTH = 360;
const IMAGE_THUMBNAIL_MAX_HEIGHT = 240;
const IMAGE_THUMBNAIL_LEGACY_MAX_WIDTH = 360;
const IMAGE_THUMBNAIL_LEGACY_MAX_HEIGHT = 240;
const VIDEO_THUMBNAIL_MAX_WIDTH = 360;
const VIDEO_THUMBNAIL_MAX_HEIGHT = 220;
const VIDEO_THUMBNAIL_BLOB_LIMIT_BYTES = 24 * 1024 * 1024;
const CANVAS_NAV_THUMB_MAX_WIDTH = 96;
const CANVAS_NAV_THUMB_MAX_HEIGHT = 72;
const CANVAS_NAV_THUMB_QUALITY = 0.42;

const createVideoThumbnailInWebview = (path: string) => new Promise<string>((resolve) => {
  const source = normalizeLocalDragPath(path);
  if (!source) {
    resolve('');
    return;
  }

  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  const abortController = new AbortController();
  let objectUrl = '';
  let settled = false;
  const cleanup = () => {
    abortController.abort();
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
  };
  const finish = (value = '') => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(value);
  };
  const timer = window.setTimeout(() => finish(''), 9000);
  let candidateTimes: number[] = [];
  let candidateIndex = 0;
  let lastThumbnail = '';

  const isMostlyDarkFrame = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    try {
      const data = ctx.getImageData(0, 0, width, height).data;
      const step = Math.max(4, Math.floor(data.length / 4800) * 4);
      let sampled = 0;
      let bright = 0;
      for (let i = 0; i < data.length; i += step) {
        const alpha = data[i + 3] / 255;
        const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * alpha;
        if (luma > 28) bright += 1;
        sampled += 1;
      }
      return sampled > 0 && bright / sampled < 0.035;
    } catch (_) {
      return false;
    }
  };

  const capture = () => {
    try {
      const naturalWidth = video.videoWidth || 640;
      const naturalHeight = video.videoHeight || 360;
      const ratio = Math.min(
        VIDEO_THUMBNAIL_MAX_WIDTH / naturalWidth,
        VIDEO_THUMBNAIL_MAX_HEIGHT / naturalHeight,
        1,
      );
      const width = Math.max(1, Math.round(naturalWidth * ratio));
      const height = Math.max(1, Math.round(naturalHeight * ratio));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        window.clearTimeout(timer);
        finish('');
        return;
      }
      ctx.drawImage(video, 0, 0, width, height);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.68);
      lastThumbnail = thumbnail;
      if (isMostlyDarkFrame(ctx, width, height) && candidateIndex < candidateTimes.length) {
        seekNextCandidate();
        return;
      }
      window.clearTimeout(timer);
      finish(thumbnail);
    } catch (err) {
      console.warn('浏览器视频缩略图生成失败:', err);
      window.clearTimeout(timer);
      finish(lastThumbnail);
    }
  };

  const seekNextCandidate = () => {
    const nextTime = candidateTimes[candidateIndex++];
    if (!Number.isFinite(nextTime)) {
      window.clearTimeout(timer);
      finish(lastThumbnail);
      return;
    }
    if (Math.abs(video.currentTime - nextTime) < 0.03) {
      capture();
      return;
    }
    video.currentTime = nextTime;
  };

  video.muted = true;
  video.preload = 'metadata';
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.addEventListener('error', () => {
    window.clearTimeout(timer);
    finish('');
  }, { once: true });
  video.addEventListener('loadedmetadata', () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const rawTimes = duration > 0
      ? [1, duration * 0.12, duration * 0.25, duration * 0.5, duration * 0.75, 0.25, 0]
      : [1, 0.25, 0];
    candidateTimes = Array.from(new Set(rawTimes
      .map(value => Math.max(0, Math.min(duration || value, value)))
      .map(value => Number(value.toFixed(2)))
    ));
    seekNextCandidate();
  }, { once: true });
  video.addEventListener('seeked', capture);

  const assetUrl = convertFileSrc(source);
  const loadAssetUrlDirectly = () => {
    if (settled) return;
    video.src = assetUrl;
    video.load();
  };

  fetch(assetUrl, { method: 'HEAD', signal: abortController.signal })
    .then(response => {
      const size = Number(response.headers.get('content-length') || 0);
      if (!Number.isFinite(size) || size <= 0) {
        throw new Error('video size unknown; skip blob thumbnail fallback');
      }
      if (size > VIDEO_THUMBNAIL_BLOB_LIMIT_BYTES) {
        throw new Error(`video too large for blob thumbnail fallback: ${size}`);
      }
    })
    .catch(err => {
      if (err?.name === 'AbortError') return;
      console.warn('视频大小探测失败或超限，尝试直接读取视频帧:', err);
      throw err;
    })
    .then(() => fetch(assetUrl, { signal: abortController.signal }))
    .then(response => response.ok ? response.blob() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then(blob => {
      if (blob.size > VIDEO_THUMBNAIL_BLOB_LIMIT_BYTES) {
        throw new Error(`video too large for blob thumbnail fallback: ${blob.size}`);
      }
      if (settled) return;
      objectUrl = URL.createObjectURL(blob);
      video.src = objectUrl;
      video.load();
    })
    .catch(err => {
      if (err?.name === 'AbortError' || settled) return;
      console.warn('视频文件读取失败，回退 asset URL:', err);
      loadAssetUrlDirectly();
    });
});

export const getVideoThumbnail = async (path: string) => {
  const source = normalizeLocalDragPath(path);
  try {
    const thumb = String(await invoke('get_video_thumb', { path: source }) || '');
    if (thumb) return thumb;
  } catch (err) {
    console.warn('FFmpeg 视频缩略图生成失败，尝试浏览器兜底:', err);
  }
  return createVideoThumbnailInWebview(source);
};

export const createImageThumbnailInWebview = (source: string) => new Promise<string>((resolve) => {
  const rawSource = (source || '').trim();
  if (!rawSource || /^data:image\/svg/i.test(rawSource)) {
    resolve('');
    return;
  }

  const image = new window.Image();
  const canvas = document.createElement('canvas');
  let objectUrl = '';
  let settled = false;
  let timer: number | null = null;

  const cleanup = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
    canvas.width = 0;
    canvas.height = 0;
  };

  const finish = (value = '') => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(value);
  };

  image.onload = () => {
    try {
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      if (!naturalWidth || !naturalHeight) {
        finish('');
        return;
      }

      const ratio = Math.min(
        IMAGE_THUMBNAIL_MAX_WIDTH / naturalWidth,
        IMAGE_THUMBNAIL_MAX_HEIGHT / naturalHeight,
        1,
      );
      const width = Math.max(1, Math.round(naturalWidth * ratio));
      const height = Math.max(1, Math.round(naturalHeight * ratio));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finish('');
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      finish(canvas.toDataURL('image/webp', 0.66));
    } catch (err) {
      console.warn('图片缩略图生成失败:', err);
      finish('');
    }
  };
  image.onerror = () => finish('');
  image.decoding = 'async';
  image.crossOrigin = 'anonymous';
  timer = window.setTimeout(() => finish(''), 8000);

  image.src = rawSource;
});

const getCanvasNavMediaElementSource = (source: string) => {
  const rawSource = (source || '').trim();
  if (!rawSource) return '';
  if (/^[a-zA-Z]:[\\/]/.test(rawSource) || rawSource.startsWith('\\\\')) {
    return convertFileSrc(rawSource);
  }
  if (/^[a-z][a-z\d+\-.]*:/i.test(rawSource)) {
    return rawSource;
  }
  return convertFileSrc(rawSource);
};

export const createCanvasNavImageThumbnailInWebview = (source: string) => new Promise<string>((resolve) => {
  const rawSource = (source || '').trim();
  if (!rawSource) {
    resolve('');
    return;
  }
  if (/^data:image\/svg/i.test(rawSource)) {
    resolve(rawSource);
    return;
  }

  const image = new window.Image();
  const canvas = document.createElement('canvas');
  let settled = false;
  let timer: number | null = null;

  const cleanup = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    canvas.width = 0;
    canvas.height = 0;
  };
  const finish = (value = '') => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(value);
  };

  image.onload = () => {
    try {
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      if (!naturalWidth || !naturalHeight) {
        finish('');
        return;
      }
      const ratio = Math.min(
        CANVAS_NAV_THUMB_MAX_WIDTH / naturalWidth,
        CANVAS_NAV_THUMB_MAX_HEIGHT / naturalHeight,
        1,
      );
      const width = Math.max(1, Math.round(naturalWidth * ratio));
      const height = Math.max(1, Math.round(naturalHeight * ratio));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finish('');
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      finish(canvas.toDataURL('image/webp', CANVAS_NAV_THUMB_QUALITY));
    } catch (err) {
      console.warn('画布导航缩略图生成失败:', err);
      finish('');
    }
  };
  image.onerror = () => finish('');
  image.decoding = 'async';
  const elementSource = getCanvasNavMediaElementSource(rawSource);
  if (!/^data:/i.test(elementSource)) {
    image.crossOrigin = 'anonymous';
  }
  timer = window.setTimeout(() => finish(''), 5000);
  image.src = elementSource;
});

export const createCanvasNavVideoThumbnailInWebview = (source: string) => new Promise<string>((resolve) => {
  const elementSource = getCanvasNavMediaElementSource(source);
  if (!elementSource) {
    resolve('');
    return;
  }

  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  let settled = false;
  let timer: number | null = null;

  const cleanup = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
    canvas.width = 0;
    canvas.height = 0;
  };
  const finish = (value = '') => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(value);
  };
  const capture = () => {
    try {
      const naturalWidth = video.videoWidth || 0;
      const naturalHeight = video.videoHeight || 0;
      if (!naturalWidth || !naturalHeight) {
        finish('');
        return;
      }
      const ratio = Math.min(
        CANVAS_NAV_THUMB_MAX_WIDTH / naturalWidth,
        CANVAS_NAV_THUMB_MAX_HEIGHT / naturalHeight,
        1,
      );
      const width = Math.max(1, Math.round(naturalWidth * ratio));
      const height = Math.max(1, Math.round(naturalHeight * ratio));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finish('');
        return;
      }
      ctx.drawImage(video, 0, 0, width, height);
      finish(canvas.toDataURL('image/webp', CANVAS_NAV_THUMB_QUALITY));
    } catch (err) {
      console.warn('画布导航视频缩略图生成失败:', err);
      finish('');
    }
  };

  video.muted = true;
  video.preload = 'metadata';
  video.playsInline = true;
  if (!/^data:/i.test(elementSource)) {
    video.crossOrigin = 'anonymous';
  }
  video.addEventListener('error', () => finish(''), { once: true });
  video.addEventListener('loadedmetadata', () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const targetTime = duration > 0.1 ? Math.min(0.8, Math.max(0, duration * 0.12)) : 0;
    if (targetTime > 0.03) {
      try {
        video.currentTime = targetTime;
      } catch {
        capture();
      }
      return;
    }
    capture();
  }, { once: true });
  video.addEventListener('seeked', capture, { once: true });
  timer = window.setTimeout(() => finish(''), 6000);
  video.src = elementSource;
  video.load();
});

export const readDataImageSize = (source?: string) => new Promise<{ width: number; height: number } | null>((resolve) => {
  const rawSource = (source || '').trim();
  if (!rawSource.startsWith('data:image/')) {
    resolve(null);
    return;
  }

  const image = new window.Image();
  let settled = false;
  const finish = (value: { width: number; height: number } | null) => {
    if (settled) return;
    settled = true;
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    resolve(value);
  };
  const timer = window.setTimeout(() => finish(null), 2000);

  image.onload = () => {
    window.clearTimeout(timer);
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    finish(width > 0 && height > 0 ? { width, height } : null);
  };
  image.onerror = () => {
    window.clearTimeout(timer);
    finish(null);
  };
  image.decoding = 'async';
  image.src = rawSource;
});

export const isLegacyImageThumbnail = async (thumbnail?: string) => {
  const size = await readDataImageSize(thumbnail);
  if (!size) return false;
  return (
    (
      size.width >= IMAGE_THUMBNAIL_LEGACY_MAX_WIDTH - 1 ||
      size.height >= IMAGE_THUMBNAIL_LEGACY_MAX_HEIGHT - 1
    ) &&
    (size.width < IMAGE_THUMBNAIL_MAX_WIDTH || size.height < IMAGE_THUMBNAIL_MAX_HEIGHT)
  );
};
