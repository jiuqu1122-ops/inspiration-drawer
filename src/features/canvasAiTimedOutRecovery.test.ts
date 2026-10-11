import { describe, expect, it } from 'vitest';
import type { CanvasImageItem } from './canvasModel';
import {
  CANVAS_AI_TIMED_OUT_RECOVERY_MAX_AGE_MS,
  getCanvasAiTimedOutRecoveryCandidates,
  isCanvasAiImageLookupPending,
  CanvasAiLookupRetrySchedule,
  getCanvasAiLookupRetryDelay,
  isCanvasAiLookupTerminalError,
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
  it('stops permanent lookup failures while keeping transient and missing rows recoverable', () => {
    for (const error of ['cloud_request_failed: HTTP 414: URI Too Long', 'HTTP: 431', 'invalid_request: bad ID']) {
      expect(isCanvasAiLookupTerminalError(error)).toBe(true);
    }
    for (const error of ['HTTP 429', 'HTTP 401', 'HTTP 503', 'image_request_not_found: HTTP 404', 'cloud_unavailable: 请求发送失败']) {
      expect(isCanvasAiLookupTerminalError(error)).toBe(false);
    }
  });

  it('honors retry timing when canvas updates repeatedly rerun the recovery effect', () => {
    const schedule = new CanvasAiLookupRetrySchedule();
    schedule.defer('request-a', 8_000, 1_000);
    expect(schedule.canRetry('request-a', 1_001)).toBe(false);
    expect(schedule.canRetry('request-a', 8_999)).toBe(false);
    expect(schedule.canRetry('request-a', 9_000)).toBe(true);
    expect(schedule.canRetry('request-b', 1_001)).toBe(true);
    schedule.defer('request-a', 60_000, 9_000);
    expect(schedule.canRetry('request-a', 68_999)).toBe(false);
  });

  it('backs off for auth refreshes and rate limits', () => {
    expect(getCanvasAiLookupRetryDelay('HTTP 429: too many requests')).toBe(60_000);
    expect(getCanvasAiLookupRetryDelay('unauthorized: token expired')).toBe(60_000);
    expect(getCanvasAiLookupRetryDelay('HTTP 502')).toBe(8_000);
    expect(getCanvasAiLookupRetryDelay('HTTP 414: URI Too Long')).toBe(300_000);
  });
  it('keeps timed-out recovery candidates for at most 30 minutes', () => {
    expect(CANVAS_AI_TIMED_OUT_RECOVERY_MAX_AGE_MS).toBe(30 * 60 * 1000);
    expect(getCanvasAiTimedOutRecoveryCandidates(
      [imageNode()],
      10_000 + CANVAS_AI_TIMED_OUT_RECOVERY_MAX_AGE_MS,
    )).toHaveLength(1);
    expect(getCanvasAiTimedOutRecoveryCandidates(
      [imageNode()],
      10_001 + CANVAS_AI_TIMED_OUT_RECOVERY_MAX_AGE_MS,
    )).toHaveLength(0);
  });

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

  it('keeps a historical successful video receipt recoverable when media is missing', () => {
    const node = imageNode();
    node.ai = {
      ...node.ai!,
      type: 'video-generator',
      outputs: [{
        id: 'video-output-1',
        taskId: 'upstream-video-1',
        clientRequestId: 'video-request-1',
        mediaType: 'video',
        status: 'success',
        generatedAt: 10_000,
      }],
    };
    const candidates = getCanvasAiTimedOutRecoveryCandidates(
      [node],
      10_000 + CANVAS_AI_TIMED_OUT_RECOVERY_MAX_AGE_MS + 1,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      clientRequestId: 'video-request-1',
      mediaType: 'video',
    });
  });
});
