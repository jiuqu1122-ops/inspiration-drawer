import { describe, expect, it, vi } from 'vitest';

import { syncCanvasVideoPlayback } from './CanvasSelectionVideo';

describe('canvas video playback', () => {
  it('plays a selected canvas video', () => {
    const video = {
      pause: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
    };

    syncCanvasVideoPlayback(video, true);

    expect(video.play).toHaveBeenCalledOnce();
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('pauses an unselected canvas video', () => {
    const video = {
      pause: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
    };

    syncCanvasVideoPlayback(video, false);

    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
  });
});
