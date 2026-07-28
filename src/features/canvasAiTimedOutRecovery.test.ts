import { describe, expect, it } from 'vitest';
import type { CanvasImageItem } from './canvasModel';
import {
  getCanvasAiTimedOutRecoveryCandidates,
  isCanvasAiImageLookupPending,
} from './canvasAiTimedOutRecovery';

const imageNode = (overrides: Partial<CanvasImageItem> = {}): CanvasImageItem => ({
  id: 'node-1',
  x: 0,
  y: 0,
  width: 320,
  height: 300,
  item: {
    id: 'item-1',
    type: 'image',
    name: 'generator',
    content: '',
    createdAt: 1,
  },
  ai: {
    type: 'image-generator',
    credentialSource: 'wallet',
    status: 'error',
    generatedAt: 10_000,
    outputs: [{
      id: 'output-1',
      status: 'error',
      generatedAt: 10_000,
      clientRequestId: 'node-1-request-123',
    }],
  },
  ...overrides,
});

describe('canvas AI timed-out recovery', () => {
  it('finds a recent wallet output that still has no result source', () => {
    const candidates = getCanvasAiTimedOutRecoveryCandidates([imageNode()], 20_000);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.clientRequestId).toBe('node-1-request-123');
  });

  it('does not guess old outputs without a request id', () => {
    const node = imageNode();
    delete node.ai?.outputs?.[0]?.clientRequestId;
    expect(getCanvasAiTimedOutRecoveryCandidates([node], 20_000)).toHaveLength(0);
  });

  it('leaves outputs with an existing result source to normal cache recovery', () => {
    const node = imageNode();
    if (node.ai?.outputs?.[0]) {
      node.ai.outputs[0].sourceUrl = 'https://api.unmind.art/v1/ai/image-results/result.png';
    }
    expect(getCanvasAiTimedOutRecoveryCandidates([node], 20_000)).toHaveLength(0);
  });

  it('recognizes server states that should continue polling', () => {
    expect(isCanvasAiImageLookupPending('reserved')).toBe(true);
    expect(isCanvasAiImageLookupPending('processing')).toBe(true);
    expect(isCanvasAiImageLookupPending('succeeded')).toBe(false);
  });

  it('does not poll a generation that is still actively inside the 15 minute window', () => {
    const node = imageNode();
    if (node.ai?.outputs?.[0]) node.ai.outputs[0].status = 'working';
    expect(getCanvasAiTimedOutRecoveryCandidates([node], 20_000)).toHaveLength(0);
    expect(getCanvasAiTimedOutRecoveryCandidates([node], 910_000)).toHaveLength(1);
  });
});
