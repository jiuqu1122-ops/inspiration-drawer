import { describe, expect, it } from 'vitest';

import {
  canRetryInspirationAnalysis,
  getInspirationAnalysisRetryAt,
  hasUsableInspirationAiTags,
  isRetryableInspirationAnalysisFailure,
  shouldSkipInspirationAnalysis,
} from './inspirationAnalysis';

describe('automatic inspiration analysis retries', () => {
  it('only treats profiles with a non-empty AI tag as complete', () => {
    expect(hasUsableInspirationAiTags({ aiTags: [] })).toBe(false);
    expect(hasUsableInspirationAiTags({
      aiTags: [{ name: 'minimalism', category: '风格', confidence: 0.9 }],
    })).toBe(true);
  });

  it('retries transient upstream failures after a cooldown', () => {
    const failure = {
      attemptedAt: 1_000,
      attempts: 1,
      message: 'UPSTREAM_UNAVAILABLE: HTTP 500 do_request_failed',
    };

    expect(isRetryableInspirationAnalysisFailure(failure)).toBe(true);
    expect(canRetryInspirationAnalysis(failure, getInspirationAnalysisRetryAt(failure) - 1)).toBe(false);
    expect(canRetryInspirationAnalysis(failure, getInspirationAnalysisRetryAt(failure))).toBe(true);
    expect(shouldSkipInspirationAnalysis(failure)).toBe(false);
  });

  it('skips a missing or unreadable image immediately', () => {
    const failure = {
      attemptedAt: 1_000,
      attempts: 1,
      message: '图片素材没有可读取的图像来源',
    };

    expect(isRetryableInspirationAnalysisFailure(failure)).toBe(false);
    expect(shouldSkipInspirationAnalysis(failure)).toBe(true);
  });

  it('stops retrying a transient failure after three attempts', () => {
    const failure = {
      attemptedAt: 1_000,
      attempts: 3,
      message: 'Failed to fetch',
    };

    expect(canRetryInspirationAnalysis(failure, 100_000)).toBe(false);
    expect(shouldSkipInspirationAnalysis(failure)).toBe(true);
  });
});
