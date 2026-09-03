import { describe, expect, it } from 'vitest';
import { cloneCanvasAiForPaste } from './canvasClipboard';

describe('cloneCanvasAiForPaste', () => {
  it('clears workflow execution state while retaining configured slot bindings', () => {
    const source = {
      type: 'workflow' as const,
      status: 'success' as const,
      error: 'old error',
      generatedAt: 123,
      outputs: [{ id: 'output-1', status: 'success' as const, url: 'https://example.com/result.png' }],
      workflowRuntime: {
        nodeSnapshots: {
          node1: { templateId: 'node1', ai: { status: 'success' as const } },
        },
        internalSlotBindings: {
          slot1: {
            slotId: 'slot1',
            assets: [{ sourceItemId: 'image-1', updatedAt: 100 }],
          },
        },
      },
    };

    const copy = cloneCanvasAiForPaste(source);

    expect(copy.status).toBe('idle');
    expect(copy.error).toBeUndefined();
    expect(copy.generatedAt).toBeUndefined();
    expect(copy.outputs).toEqual([]);
    expect(copy.workflowRuntime).toEqual({
      internalSlotBindings: source.workflowRuntime.internalSlotBindings,
    });
    expect(copy.workflowRuntime).not.toBe(source.workflowRuntime);
  });
});
