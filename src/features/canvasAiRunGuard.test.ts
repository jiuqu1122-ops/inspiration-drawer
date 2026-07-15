import { describe, expect, it } from 'vitest';
import { claimCanvasAiRun, releaseCanvasAiRun } from './canvasAiRunGuard';

describe('canvas AI run guard', () => {
  it('allows only one active task for rapid clicks on the same node', () => {
    const activeRuns = new Map<string, string>();
    expect(claimCanvasAiRun(activeRuns, 'node-1', 'request-1')).toBe(true);
    expect(claimCanvasAiRun(activeRuns, 'node-1', 'request-2')).toBe(false);
    expect(activeRuns.get('node-1')).toBe('request-1');
  });

  it('releases only the matching request', () => {
    const activeRuns = new Map([['node-1', 'request-1']]);
    expect(releaseCanvasAiRun(activeRuns, 'node-1', 'request-2')).toBe(false);
    expect(releaseCanvasAiRun(activeRuns, 'node-1', 'request-1')).toBe(true);
    expect(activeRuns.has('node-1')).toBe(false);
  });
});
