import { describe, expect, it } from 'vitest';
import type { CanvasImageItem } from './canvasModel';
import {
  getCanvasAiMediaType,
  getCanvasAiNodeAutoSizeType,
  getCanvasAiNodeTitle,
  isCanvasAiGeneratedType,
  isCanvasAiGeneratorType,
} from './canvasAiRuntime';

const aiWithType = (type: NonNullable<CanvasImageItem['ai']>['type']) => (
  { type } as NonNullable<CanvasImageItem['ai']>
);

describe('canvasAiRuntime metadata helpers', () => {
  it('preserves generator and generated-node classification', () => {
    expect(isCanvasAiGeneratorType('image-generator')).toBe(true);
    expect(isCanvasAiGeneratorType('video-generator')).toBe(true);
    expect(isCanvasAiGeneratorType('frame-interpolation')).toBe(true);
    expect(isCanvasAiGeneratorType('image-enhancement')).toBe(true);
    expect(isCanvasAiGeneratorType('video-enhancement')).toBe(true);
    expect(isCanvasAiGeneratorType('workflow')).toBe(false);
    expect(isCanvasAiGeneratedType('generated-image')).toBe(true);
    expect(isCanvasAiGeneratedType('generated-video')).toBe(true);
    expect(isCanvasAiGeneratedType('image-generator')).toBe(false);
  });

  it('preserves media and auto-size type selection', () => {
    expect(getCanvasAiMediaType(aiWithType('image-generator'))).toBe('image');
    expect(getCanvasAiMediaType(aiWithType('image-enhancement'))).toBe('image');
    expect(getCanvasAiMediaType(aiWithType('video-generator'))).toBe('video');
    expect(getCanvasAiMediaType(aiWithType('frame-interpolation'))).toBe('video');
    expect(getCanvasAiMediaType(aiWithType('video-enhancement'))).toBe('video');
    expect(getCanvasAiMediaType(aiWithType('generated-video'))).toBe('video');
    expect(getCanvasAiNodeAutoSizeType(aiWithType('workflow'))).toBe('workflow');
    expect(getCanvasAiNodeAutoSizeType(aiWithType('video-enhancement'))).toBe('video-generator');
    expect(getCanvasAiNodeAutoSizeType(aiWithType('image-generator'))).toBe('image-generator');
  });

  it('preserves the user-facing node titles', () => {
    expect(getCanvasAiNodeTitle(aiWithType('frame-interpolation'))).toBe('视频补帧节点');
    expect(getCanvasAiNodeTitle(aiWithType('video-enhancement'))).toBe('视频清晰度增强');
    expect(getCanvasAiNodeTitle(aiWithType('image-enhancement'))).toBe('图片清晰度增强');
    expect(getCanvasAiNodeTitle(aiWithType('video-generator'))).toBe('AI 视频节点');
    expect(getCanvasAiNodeTitle(aiWithType('image-generator'))).toBe('AI 生图节点');
    expect(getCanvasAiNodeTitle({
      ...aiWithType('image-generator'),
      imageFusion: { enabled: true },
    })).toBe('AI 溶图节点');
  });
});
