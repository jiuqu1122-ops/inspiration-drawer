import { describe, expect, it } from 'vitest';

import type { InspirationProfile } from '../features/appAgent/inspirationMemory/types';
import {
  getAiImageAnalysisPalette,
  getAiImageAnalysisTerms,
} from './BufferItemCard';

const createProfile = (patch: Partial<InspirationProfile> = {}): InspirationProfile => ({
  itemId: 'item-1',
  summary: 'AI image analysis',
  objects: [],
  category: '',
  form: { silhouette: [], geometry: [], proportion: [] },
  cmf: { colors: [], materials: [], finishes: [] },
  style: [],
  interaction: [],
  scene: [],
  mood: [],
  userTags: [],
  userNotes: [],
  ...patch,
});

describe('getAiImageAnalysisTerms', () => {
  it('keeps descriptive AI colors as text and combines all AI CMF terms and tags', () => {
    const profile = createProfile({
      cmf: {
        colors: ['soft ivory', ' graphite ', 'soft ivory'],
        materials: ['brushed aluminum'],
        finishes: ['matte anodized'],
      },
      aiTags: [
        { name: 'minimal', category: '风格', confidence: 0.94 },
        { name: 'graphite', category: '色彩', confidence: 0.9 },
      ],
    });

    expect(getAiImageAnalysisTerms(profile)).toEqual([
      'soft ivory',
      'graphite',
      'brushed aluminum',
      'matte anodized',
      'minimal',
    ]);
  });

  it('returns no terms without an AI profile and respects the display limit', () => {
    expect(getAiImageAnalysisTerms(undefined)).toEqual([]);
    expect(getAiImageAnalysisTerms(createProfile({
      cmf: {
        colors: ['red', 'green'],
        materials: ['steel'],
        finishes: ['satin'],
      },
    }), 3)).toEqual(['red', 'green', 'steel']);
  });

  it('builds four display swatches from AI color names without local image analysis', () => {
    const profile = createProfile({
      cmf: {
        colors: ['米白色', '暖灰色', '炭黑色', '#b88768', 'extra blue'],
        materials: [],
        finishes: [],
      },
    });

    expect(getAiImageAnalysisPalette(profile)).toEqual([
      { label: '米白色', color: '#eee8dc' },
      { label: '暖灰色', color: '#a9aaa7' },
      { label: '炭黑色', color: '#2b2b2a' },
      { label: '#b88768', color: '#b88768' },
    ]);
  });

  it('uses AI color tags when CMF colors are missing or malformed', () => {
    const profile = createProfile({
      cmf: {
        colors: ['[object Object]'],
        materials: [],
        finishes: [],
      },
      aiTags: [
        { name: '炭黑色', category: '色彩', confidence: 0.96 },
        { name: '暖白色', category: '色彩', confidence: 0.92 },
        { name: '黄铜色', category: '色彩', confidence: 0.89 },
        { name: '深灰色', category: '色彩', confidence: 0.86 },
      ],
    });

    expect(getAiImageAnalysisPalette(profile)).toEqual([
      { label: '炭黑色', color: '#2b2b2a' },
      { label: '暖白色', color: '#eee8dc' },
      { label: '黄铜色', color: '#a97945' },
      { label: '深灰色', color: '#555754' },
    ]);
  });

  it('accepts palette fields and color objects returned by AI providers', () => {
    const profile = {
      ...createProfile(),
      cmf: { colors: [], materials: [], finishes: [] },
      colorPalette: [
        { name: '主色', hex: '#123456' },
        { label: '辅色', color: 'rgb(220, 180, 120)' },
        { name: '点缀色', value: '#f0a' },
        { hex: '#101010' },
      ],
    } as unknown as InspirationProfile;

    expect(getAiImageAnalysisPalette(profile)).toEqual([
      { label: '主色', color: '#123456' },
      { label: '辅色', color: 'rgb(220, 180, 120)' },
      { label: '点缀色', color: '#f0a' },
      { label: '#101010', color: '#101010' },
    ]);
    expect(getAiImageAnalysisTerms(profile).slice(0, 4)).toEqual([
      '主色',
      '辅色',
      '点缀色',
      '#101010',
    ]);
  });
});
