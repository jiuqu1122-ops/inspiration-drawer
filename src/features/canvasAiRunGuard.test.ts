import { describe, expect, it } from 'vitest';
import {
  claimCanvasAiRun,
  createCanvasAiClientRequestId,
  releaseCanvasAiRun,
} from './canvasAiRunGuard';

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

  it('keeps long workflow output request ids compatible with the wallet service', () => {
    const workflowPath = [
      'canvas-ai_canvas-1785230285716-cd65657aa7d50644',
      'workflow-node-fixed-background-template-with-a-very-long-identifier',
      'output:3',
      '中文节点',
    ].join(':');
    const requestId = createCanvasAiClientRequestId(workflowPath, 1_785_230_285_716);

    expect(requestId.length).toBeGreaterThanOrEqual(8);
    expect(requestId.length).toBeLessThanOrEqual(120);
    expect(`${requestId}:slot:4`.length).toBeLessThanOrEqual(128);
    expect(requestId).toMatch(/^[a-zA-Z0-9._:-]+$/);
  });
});
