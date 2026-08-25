import { describe, expect, it } from 'vitest';
import {
  assignCanvasImageFusionInputs,
  buildCanvasImageFusionPrompt,
  normalizeCanvasImageFusionConfig,
  removeCanvasImageFusionInput,
} from './canvasImageFusion';

describe('canvas image fusion', () => {
  it('uses the first two connected images as BASE and STYLE_REF', () => {
    const config = normalizeCanvasImageFusionConfig(undefined, ['base', 'style', 'extra']);
    expect(config.baseNodeId).toBe('base');
    expect(config.styleNodeId).toBe('style');
    expect(config.baseWeight).toBe(80);
    expect(config.styleWeight).toBe(45);
  });

  it('replaces a requested slot without changing the other slot', () => {
    const assigned = assignCanvasImageFusionInputs({
      enabled: true,
      baseNodeId: 'base',
      styleNodeId: 'style',
    }, ['base', 'style'], ['new-style'], 'STYLE_REF');
    expect(assigned.inputs).toEqual(['base', 'new-style']);
    expect(assigned.referenceRoles).toEqual([
      { nodeId: 'base', role: 'BASE' },
      { nodeId: 'new-style', role: 'STYLE_REF' },
    ]);
  });

  it('removes only the matching fusion role', () => {
    const next = removeCanvasImageFusionInput({
      enabled: true,
      baseNodeId: 'base',
      styleNodeId: 'style',
    }, ['base', 'style'], 'base');
    expect(next.config.baseNodeId).toBeNull();
    expect(next.config.styleNodeId).toBe('style');
    expect(next.inputs).toEqual(['style']);
  });

  it('drops configured roles whose upstream connection no longer exists', () => {
    const config = normalizeCanvasImageFusionConfig({
      enabled: true,
      baseNodeId: 'deleted-base',
      styleNodeId: 'style',
    }, ['style']);
    expect(config.baseNodeId).toBeNull();
    expect(config.styleNodeId).toBe('style');
  });

  it('builds a role-ordered prompt with independent weights and original request', () => {
    const prompt = buildCanvasImageFusionPrompt({
      baseWeight: 92,
      styleWeight: 38,
      originalRequest: '保留壶嘴，融合温润陶瓷语言',
    });
    expect(prompt).toContain('Image 1 = BASE');
    expect(prompt).toContain('Image 2 = STYLE_REF');
    expect(prompt).toContain('92/100');
    expect(prompt).toContain('38/100');
    expect(prompt).toContain('do not need to add up to 100');
    expect(prompt).toContain('Original request: "保留壶嘴，融合温润陶瓷语言"');
  });
});
