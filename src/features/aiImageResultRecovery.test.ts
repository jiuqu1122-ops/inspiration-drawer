import { describe, expect, it } from 'vitest';
import {
  getAutoRecoverableAiImageResultSource,
  getAutoRecoverableAiMediaResultSource,
  getStableAiImageResultSource,
  getStableAiVideoResultSource,
} from './aiImageResultRecovery';

describe('AI image result recovery source', () => {
  it('normalizes a wallet result URL and removes stale query parameters', () => {
    expect(getStableAiImageResultSource(
      'https://api.unmind.art/v1/ai/image-results/abc.png?redirect=0',
    )).toBe('https://api.unmind.art/v1/ai/image-results/abc.png');
  });

  it('rebuilds the stable API URL from an expired generated OSS URL', () => {
    expect(getStableAiImageResultSource(
      'https://inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com/generated-images/abc.png?Expires=1&Signature=expired',
    )).toBe('https://api.unmind.art/v1/ai/image-results/abc.png');
  });

  it('rejects untrusted hosts and unrelated OSS namespaces', () => {
    expect(getStableAiImageResultSource(
      'https://evil.example/generated-images/abc.png',
    )).toBeNull();
    expect(getStableAiImageResultSource(
      'https://inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com/reference-images/abc.png',
    )).toBeNull();
  });

  it('normalizes stable wallet and OSS video result URLs', () => {
    expect(getStableAiVideoResultSource(
      'https://api.unmind.art/v1/ai/video-results/abc.mp4?redirect=0',
    )).toBe('https://api.unmind.art/v1/ai/video-results/abc.mp4');
    expect(getStableAiVideoResultSource(
      'https://inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com/generated-videos/abc.mp4?Expires=1&Signature=expired',
    )).toBe('https://api.unmind.art/v1/ai/video-results/abc.mp4');
  });

  it('only selects completed image outputs whose local cache needs repair', () => {
    const source = 'https://api.unmind.art/v1/ai/image-results/abc.png';
    expect(getAutoRecoverableAiImageResultSource({
      mediaType: 'image',
      status: 'success',
      cacheStatus: 'failed',
      source,
    })).toBe(source);
    expect(getAutoRecoverableAiImageResultSource({
      mediaType: 'image',
      status: 'success',
      cacheStatus: 'pending',
      source,
    })).toBeNull();
    expect(getAutoRecoverableAiImageResultSource({
      mediaType: 'image',
      status: 'success',
      cacheStatus: 'ready',
      path: 'C:\\cache\\abc.png',
      source,
    })).toBeNull();
    expect(getAutoRecoverableAiImageResultSource({
      mediaType: 'video',
      status: 'success',
      cacheStatus: 'failed',
      source,
    })).toBeNull();
  });

  it('selects completed video outputs whose local cache needs repair', () => {
    const source = 'https://api.unmind.art/v1/ai/video-results/abc.mp4';
    expect(getAutoRecoverableAiMediaResultSource({
      mediaType: 'video',
      status: 'success',
      cacheStatus: 'failed',
      source,
    })).toBe(source);
    expect(getAutoRecoverableAiMediaResultSource({
      mediaType: 'video',
      status: 'success',
      cacheStatus: 'pending',
      source,
    })).toBeNull();
  });
});
