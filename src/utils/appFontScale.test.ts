import { describe, expect, it } from 'vitest';
import {
  APP_FONT_SIZE_OPTIONS,
  DEFAULT_APP_FONT_SIZE,
  getAppFontScale,
  normalizeAppFontSize,
} from './appFontScale';

describe('app font size', () => {
  it('keeps the smallest size as the default/current baseline', () => {
    expect(DEFAULT_APP_FONT_SIZE).toBe('small');
    expect(getAppFontScale(undefined)).toBe(1);
    expect(getAppFontScale('small')).toBe(1);
  });

  it('accepts only the bounded preset values', () => {
    expect(APP_FONT_SIZE_OPTIONS.map(option => option.value)).toEqual(['small', 'medium', 'large']);
    expect(normalizeAppFontSize('medium')).toBe('medium');
    expect(normalizeAppFontSize('large')).toBe('large');
    expect(normalizeAppFontSize('200%')).toBe('small');
    expect(normalizeAppFontSize(null)).toBe('small');
  });

  it('never returns a scale outside the configured range', () => {
    const scales = APP_FONT_SIZE_OPTIONS.map(option => getAppFontScale(option.value));
    expect(Math.min(...scales)).toBe(1);
    expect(Math.max(...scales)).toBe(1.2);
  });
});
