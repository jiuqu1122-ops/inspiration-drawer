import { describe, expect, it } from 'vitest';
import {
  getCanvasAiRetryNodeStatus,
  mergeCanvasAiRetryOutputSlot,
} from './canvasWorkflowOutputRetry';

describe('workflow output retry', () => {
  it('replaces only the selected image and preserves stable workflow slot metadata', () => {
    const outputs = [
      { id: 'slot-1', name: 'front', status: 'success' as const, url: 'old-1' },
      { id: 'slot-2', name: 'side', nodeId: 'render', status: 'success' as const, url: 'old-2' },
    ];
    const next = mergeCanvasAiRetryOutputSlot(
      outputs,
      1,
      [{ id: 'temporary', name: 'temporary', status: 'success', url: 'new-2' }],
      outputs[1]!,
      'success',
    );
    expect(next[0]).toBe(outputs[0]);
    expect(next[1]).toMatchObject({
      id: 'slot-2',
      name: 'side',
      nodeId: 'render',
      status: 'success',
      url: 'new-2',
    });
  });

  it('marks only the selected slot as working while keeping other images', () => {
    const outputs = [
      { id: 'slot-1', status: 'success' as const, url: 'old-1' },
      { id: 'slot-2', status: 'success' as const, url: 'old-2' },
    ];
    const next = mergeCanvasAiRetryOutputSlot(
      outputs,
      1,
      undefined,
      outputs[1]!,
      'working',
      undefined,
    );
    expect(next[0]?.status).toBe('success');
    expect(next[1]?.status).toBe('working');
    expect(getCanvasAiRetryNodeStatus(next, 'working')).toBe('working');
  });

  it('keeps the node partially failed when another output is still in error', () => {
    expect(getCanvasAiRetryNodeStatus([
      { id: 'slot-1', status: 'success' },
      { id: 'slot-2', status: 'error' },
    ], 'success')).toBe('error');
  });
});
