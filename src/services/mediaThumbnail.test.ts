import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCanvasNavImageThumbnailInWebview,
  createCanvasNavVideoThumbnailInWebview,
  createImageThumbnailInWebview,
  getVideoThumbnail,
  isLegacyImageThumbnail,
  readDataImageSize,
} from './mediaThumbnail';

const tauriMocks = vi.hoisted(() => ({
  convertFileSrc: vi.fn((path: string) => `asset://converted/${path}`),
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => tauriMocks);

type ImageBehavior = {
  width?: number;
  height?: number;
  error?: boolean;
};

const installImageDom = (
  getBehavior: (source: string) => ImageBehavior = () => ({ width: 1200, height: 600 }),
) => {
  const images: MockImage[] = [];
  const canvases: Array<{
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toDataURL: ReturnType<typeof vi.fn>;
  }> = [];
  const contexts: Array<{ drawImage: ReturnType<typeof vi.fn> }> = [];

  class MockImage {
    naturalWidth = 0;
    naturalHeight = 0;
    width = 0;
    height = 0;
    decoding = '';
    crossOrigin = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    assignedSources: string[] = [];
    removeAttribute = vi.fn();

    constructor() {
      images.push(this);
    }

    set src(value: string) {
      this.assignedSources.push(value);
      const behavior = getBehavior(value);
      queueMicrotask(() => {
        if (behavior.error) {
          this.onerror?.();
          return;
        }
        this.naturalWidth = behavior.width || 0;
        this.naturalHeight = behavior.height || 0;
        this.width = behavior.width || 0;
        this.height = behavior.height || 0;
        this.onload?.();
      });
    }
  }

  const createElement = vi.fn((tag: string) => {
    if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
    const context = { drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toDataURL: vi.fn((type: string, quality: number) => `thumb:${type}:${quality}`),
    };
    contexts.push(context);
    canvases.push(canvas);
    return canvas;
  });

  vi.stubGlobal('window', {
    Image: MockImage,
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal('document', { createElement });

  return { canvases, contexts, createElement, images };
};

type VideoDomOptions = {
  duration?: number;
  width?: number;
  height?: number;
  frameKinds?: Array<'dark' | 'bright'>;
  frameOutputs?: string[];
};

const installVideoDom = ({
  duration = 10,
  width = 1920,
  height = 1080,
  frameKinds = ['bright'],
  frameOutputs = ['video-thumb'],
}: VideoDomOptions = {}) => {
  type Listener = { callback: () => void; once: boolean };
  const listeners = new Map<string, Listener[]>();
  const assignedSources: string[] = [];
  const currentTimes: number[] = [];
  let source = '';
  let metadataQueued = false;

  const emit = (type: string) => {
    const active = [...(listeners.get(type) || [])];
    active.forEach(listener => {
      if (listener.once) {
        listeners.set(type, (listeners.get(type) || []).filter(item => item !== listener));
      }
      listener.callback();
    });
  };

  const video = {
    muted: false,
    preload: '',
    playsInline: false,
    crossOrigin: '',
    duration,
    videoWidth: width,
    videoHeight: height,
    pause: vi.fn(),
    removeAttribute: vi.fn((name: string) => {
      if (name === 'src') source = '';
    }),
    addEventListener: vi.fn((type: string, callback: () => void, options?: AddEventListenerOptions) => {
      listeners.set(type, [
        ...(listeners.get(type) || []),
        { callback, once: !!options?.once },
      ]);
    }),
    load: vi.fn(() => {
      if (!source || metadataQueued) return;
      metadataQueued = true;
      queueMicrotask(() => emit('loadedmetadata'));
    }),
    get src() {
      return source;
    },
    set src(value: string) {
      source = value;
      assignedSources.push(value);
    },
    get currentTime() {
      return currentTimes[currentTimes.length - 1] || 0;
    },
    set currentTime(value: number) {
      currentTimes.push(value);
      queueMicrotask(() => emit('seeked'));
    },
  };

  let frameIndex = 0;
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => {
      const kind = frameKinds[Math.min(frameIndex, frameKinds.length - 1)];
      frameIndex += 1;
      return {
        data: kind === 'dark'
          ? new Uint8ClampedArray([0, 0, 0, 255])
          : new Uint8ClampedArray([255, 255, 255, 255]),
      };
    }),
  };
  let outputIndex = 0;
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => frameOutputs[Math.min(outputIndex++, frameOutputs.length - 1)]),
  };
  const createElement = vi.fn((tag: string) => {
    if (tag === 'video') return video;
    if (tag === 'canvas') return canvas;
    throw new Error(`unexpected element: ${tag}`);
  });

  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('document', { createElement });

  return {
    assignedSources,
    canvas,
    context,
    createElement,
    currentTimes,
    emit,
    video,
  };
};

beforeEach(() => {
  tauriMocks.convertFileSrc.mockReset();
  tauriMocks.convertFileSrc.mockImplementation((path: string) => `asset://converted/${path}`);
  tauriMocks.invoke.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('media thumbnail service', () => {
  it('keeps the main image fast exits free of DOM work', async () => {
    const createElement = vi.fn();
    vi.stubGlobal('document', { createElement });

    await expect(createImageThumbnailInWebview('')).resolves.toBe('');
    await expect(createImageThumbnailInWebview(' data:image/svg+xml;base64,PHN2Zz4= ')).resolves.toBe('');
    expect(createElement).not.toHaveBeenCalled();
  });

  it('creates and cleans up the main image thumbnail with the original dimensions and quality', async () => {
    const dom = installImageDom(() => ({ width: 1200, height: 600 }));

    await expect(createImageThumbnailInWebview(' https://example.com/source.png ')).resolves.toBe(
      'thumb:image/webp:0.66',
    );

    expect(dom.images[0].assignedSources).toEqual(['https://example.com/source.png']);
    expect(dom.images[0].crossOrigin).toBe('anonymous');
    expect(dom.contexts[0].drawImage).toHaveBeenCalledWith(dom.images[0], 0, 0, 360, 180);
    expect(dom.canvases[0].toDataURL).toHaveBeenCalledWith('image/webp', 0.66);
    expect(dom.images[0].removeAttribute).toHaveBeenCalledWith('src');
    expect(dom.images[0].onload).toBeNull();
    expect(dom.images[0].onerror).toBeNull();
    expect(dom.canvases[0]).toMatchObject({ width: 0, height: 0 });
  });

  it('reads data-image dimensions and preserves the legacy-thumbnail boundary', async () => {
    const dom = installImageDom(source => {
      if (source.includes('legacy')) return { width: 360, height: 180 };
      if (source.includes('modern')) return { width: 360, height: 240 };
      if (source.includes('broken')) return { error: true };
      return { width: 200, height: 120 };
    });

    await expect(readDataImageSize('https://example.com/not-data.png')).resolves.toBeNull();
    await expect(readDataImageSize('data:image/png;base64,legacy')).resolves.toEqual({ width: 360, height: 180 });
    await expect(readDataImageSize('data:image/png;base64,broken')).resolves.toBeNull();
    await expect(isLegacyImageThumbnail('data:image/png;base64,legacy')).resolves.toBe(true);
    await expect(isLegacyImageThumbnail('data:image/png;base64,modern')).resolves.toBe(false);
    await expect(isLegacyImageThumbnail('data:image/png;base64,small')).resolves.toBe(false);
    expect(dom.images).toHaveLength(5);
  });

  it('marks old native JPEG thumbnails for transparent-preview regeneration', async () => {
    await expect(isLegacyImageThumbnail('asset://localhost/C:/cache/thumbs/512/old.jpg')).resolves.toBe(true);
    await expect(isLegacyImageThumbnail('asset://localhost/C:/cache/thumbs/512/new.alpha-v2.jpg')).resolves.toBe(false);
  });

  it('keeps navigation image source conversion, SVG pass-through, CORS, and sizing rules', async () => {
    const dom = installImageDom(() => ({ width: 1920, height: 1080 }));
    const svg = 'data:image/svg+xml;base64,PHN2Zz4=';

    await expect(createCanvasNavImageThumbnailInWebview(` ${svg} `)).resolves.toBe(svg);
    await createCanvasNavImageThumbnailInWebview('C:\\Images\\nav.png');
    await createCanvasNavImageThumbnailInWebview('\\\\server\\share\\nav.png');
    await createCanvasNavImageThumbnailInWebview('relative/nav.png');
    await createCanvasNavImageThumbnailInWebview('https://example.com/nav.png');
    await createCanvasNavImageThumbnailInWebview('data:image/png;base64,AAAA');

    expect(tauriMocks.convertFileSrc.mock.calls.map(([source]) => source)).toEqual([
      'C:\\Images\\nav.png',
      '\\\\server\\share\\nav.png',
      'relative/nav.png',
    ]);
    expect(dom.images.map(image => image.assignedSources[0])).toEqual([
      'asset://converted/C:\\Images\\nav.png',
      'asset://converted/\\\\server\\share\\nav.png',
      'asset://converted/relative/nav.png',
      'https://example.com/nav.png',
      'data:image/png;base64,AAAA',
    ]);
    expect(dom.images.map(image => image.crossOrigin)).toEqual([
      'anonymous',
      'anonymous',
      'anonymous',
      'anonymous',
      '',
    ]);
    expect(dom.contexts[0].drawImage).toHaveBeenCalledWith(dom.images[0], 0, 0, 96, 54);
    expect(dom.canvases[0].toDataURL).toHaveBeenCalledWith('image/webp', 0.42);
  });

  it('returns a native video thumbnail before creating browser media elements', async () => {
    tauriMocks.invoke.mockResolvedValue('native-video-thumb');
    const createElement = vi.fn();
    vi.stubGlobal('document', { createElement });

    await expect(getVideoThumbnail('  "C:\\Media\\clip.mp4"  ')).resolves.toBe('native-video-thumb');
    expect(tauriMocks.invoke).toHaveBeenCalledWith('get_video_thumb', { path: 'C:\\Media\\clip.mp4' });
    expect(createElement).not.toHaveBeenCalled();
    expect(tauriMocks.convertFileSrc).not.toHaveBeenCalled();
  });

  it('uses the WebView blob route and advances past a dark video frame', async () => {
    tauriMocks.invoke.mockResolvedValue('');
    const dom = installVideoDom({
      frameKinds: ['dark', 'bright'],
      frameOutputs: ['dark-frame', 'bright-frame'],
    });
    const createObjectURL = vi.fn(() => 'blob:video-source');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ headers: { get: () => '1024' } })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => new Blob(['video']),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getVideoThumbnail('C:\\Media\\clip.mp4')).resolves.toBe('bright-frame');

    expect(tauriMocks.invoke).toHaveBeenCalledWith('get_video_thumb', { path: 'C:\\Media\\clip.mp4' });
    expect(tauriMocks.convertFileSrc).toHaveBeenCalledWith('C:\\Media\\clip.mp4');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(dom.currentTimes).toEqual([1, 1.2]);
    expect(dom.context.drawImage).toHaveBeenLastCalledWith(dom.video, 0, 0, 360, 203);
    expect(dom.canvas.toDataURL).toHaveBeenLastCalledWith('image/jpeg', 0.68);
    expect(dom.video.pause).toHaveBeenCalledTimes(1);
    expect(dom.video.removeAttribute).toHaveBeenCalledWith('src');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:video-source');
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('falls back to the direct asset URL when native and size probing fail', async () => {
    const nativeError = new Error('native thumbnail unavailable');
    tauriMocks.invoke.mockRejectedValue(nativeError);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dom = installVideoDom({ frameOutputs: ['asset-frame'] });
    const createObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const fetchMock = vi.fn().mockResolvedValue({ headers: { get: () => null } });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getVideoThumbnail('C:\\Media\\fallback.mp4')).resolves.toBe('asset-frame');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(dom.assignedSources).toEqual(['asset://converted/C:\\Media\\fallback.mp4']);
    expect(warn).toHaveBeenCalledWith('FFmpeg 视频缩略图生成失败，尝试浏览器兜底:', nativeError);
    expect(warn).toHaveBeenCalledWith(
      '视频大小探测失败或超限，尝试直接读取视频帧:',
      expect.any(Error),
    );
  });

  it('creates a navigation video thumbnail after seeking to the existing target time', async () => {
    const dom = installVideoDom({ frameOutputs: ['nav-video-thumb'] });

    await expect(createCanvasNavVideoThumbnailInWebview('relative/nav.mp4')).resolves.toBe('nav-video-thumb');

    expect(tauriMocks.convertFileSrc).toHaveBeenCalledWith('relative/nav.mp4');
    expect(dom.assignedSources).toEqual(['asset://converted/relative/nav.mp4']);
    expect(dom.currentTimes).toEqual([0.8]);
    expect(dom.context.drawImage).toHaveBeenCalledWith(dom.video, 0, 0, 96, 54);
    expect(dom.canvas.toDataURL).toHaveBeenCalledWith('image/webp', 0.42);
    expect(dom.video.crossOrigin).toBe('anonymous');
    expect(dom.video.pause).toHaveBeenCalledTimes(1);
    expect(dom.canvas).toMatchObject({ width: 0, height: 0 });
  });
});
