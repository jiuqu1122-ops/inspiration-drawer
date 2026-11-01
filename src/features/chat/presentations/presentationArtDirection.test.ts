import { describe, expect, it } from 'vitest';
import { PRESENTATION_DESIGN_STYLES, PRESENTATION_THEMES, resolvePresentationArtDirection } from './presentationArtDirection';

describe('renderer capability validation, not topic-to-style routing', () => {
  it('passes every explicitly authored combination unchanged', () => {
    for (const designStyle of PRESENTATION_DESIGN_STYLES) for (const theme of PRESENTATION_THEMES) {
      expect(resolvePresentationArtDirection(designStyle, theme)).toEqual({ designStyle, theme });
    }
  });
  it('uses an undecorated legacy fallback rather than editorial when omitted', () => {
    expect(resolvePresentationArtDirection()).toEqual({ designStyle: 'custom', theme: 'light' });
  });
  it('normalizes transport aliases without assigning a topic to a style', () => {
    expect(resolvePresentationArtDirection('technical style', 'dark')).toEqual({ designStyle: 'technical', theme: 'dark' });
    expect(resolvePresentationArtDirection(' CINEMATIC ', ' WARM ')).toEqual({ designStyle: 'cinematic', theme: 'warm' });
  });
  it('rejects unsupported directions instead of silently returning the old template', () => {
    expect(() => resolvePresentationArtDirection('unknown-style')).toThrow('designStyle');
    expect(() => resolvePresentationArtDirection('custom', 'unknown-theme')).toThrow('theme');
  });
});
