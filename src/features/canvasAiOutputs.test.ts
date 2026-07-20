import { describe, expect, it } from 'vitest';
import { buildCanvasAiOutputLocalCachePatch } from './canvasAiOutputs';

describe('canvas AI output cache patches', () => {
  it('adds the local path without replacing the remote generation URL', () => {
    const patch = buildCanvasAiOutputLocalCachePatch('C:\\cache\\generated.png');

    expect(patch).toEqual({
      path: 'C:\\cache\\generated.png',
      cacheStatus: 'pending',
    });
    expect(patch).not.toHaveProperty('url');
  });
});
