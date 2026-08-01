import { expect, test } from 'vitest';
import type { BufferItem } from '../types';
import {
  AI_CLASSIFICATION_UNCLASSIFIED_LABEL,
  buildAiClassificationGroups,
  getItemAiClassificationLabels,
  itemMatchesAiClassification,
} from './aiClassification';

const image = (id: string, profile?: BufferItem['inspirationProfile']): BufferItem => ({
  id,
  type: 'image',
  content: '',
  createdAt: 1,
  inspirationProfile: profile,
});

const controller = image('controller', {
  itemId: 'controller',
  summary: '黑色圆润游戏手柄',
  objects: ['游戏手柄'],
  category: '游戏外设',
  form: { silhouette: ['圆润'], geometry: ['几何切面'], proportion: [] },
  cmf: { colors: ['黑色', '蓝色'], materials: ['塑料'], finishes: ['磨砂'] },
  style: ['极简'],
  interaction: [],
  scene: [],
  mood: [],
  userTags: [],
  userNotes: [],
  aiTags: [
    { name: '手柄', category: '产品类别', confidence: 0.98 },
    { name: '圆润', category: '形态', confidence: 0.94 },
    { name: '黑色', category: '色彩', confidence: 0.91 },
  ],
});

test('extracts product, form and color labels without changing folders', () => {
  expect(getItemAiClassificationLabels(controller, 'product')).toEqual(['游戏手柄']);
  expect(getItemAiClassificationLabels(controller, 'form')).toEqual(['圆润', '几何', '极简']);
  expect(getItemAiClassificationLabels(controller, 'color')).toEqual(['黑色']);
  expect(controller.folderId).toBeUndefined();
});

test('builds virtual groups and keeps unanalyzed assets visible', () => {
  const groups = buildAiClassificationGroups([controller, image('missing')], 'product');
  expect(groups).toContainEqual({ label: '游戏手柄', count: 1 });
  expect(groups[groups.length - 1]).toEqual({ label: AI_CLASSIFICATION_UNCLASSIFIED_LABEL, count: 1 });
  expect(itemMatchesAiClassification(controller, 'product', '游戏手柄')).toBe(true);
  expect(itemMatchesAiClassification(image('missing'), 'product', AI_CLASSIFICATION_UNCLASSIFIED_LABEL)).toBe(true);
});

test('merges product aliases and ignores scene or component noise', () => {
  const projector = (id: string, productTag: string): BufferItem => image(id, {
    ...controller.inspirationProfile!,
    itemId: id,
    objects: ['投影仪'],
    category: '投影设备',
    aiTags: [
      { name: productTag, category: '产品类别', confidence: 0.99 },
      { name: '客厅', category: '产品类别', confidence: 0.95 },
      { name: '按键', category: '产品类别', confidence: 0.9 },
    ],
  });
  const items = [
    projector('p1', '投影仪'),
    projector('p2', '便携投影仪'),
    projector('p3', '家用投影仪'),
    projector('p4', '桌面投影仪'),
    projector('p5', '便携式投影仪'),
  ];

  expect(buildAiClassificationGroups(items, 'product')).toEqual([
    { label: '投影仪', count: 5 },
  ]);
});

test('merges common form and color synonyms', () => {
  const variant = image('variant', {
    ...controller.inspirationProfile!,
    itemId: 'variant',
    form: { silhouette: ['圆角造型', '圆润'], geometry: ['几何切面'], proportion: [] },
    cmf: { ...controller.inspirationProfile!.cmf, colors: ['纯黑色', '黑', '暖白色'] },
    style: ['简约风格'],
    aiTags: [],
  });

  expect(getItemAiClassificationLabels(variant, 'form')).toEqual(['圆润', '几何', '极简']);
  expect(getItemAiClassificationLabels(variant, 'color')).toEqual(['黑色']);
});

test('keeps exactly one dominant color and drops malformed color values', () => {
  const primaryWhite = image('primary-white', {
    ...controller.inspirationProfile!,
    itemId: 'primary-white',
    cmf: {
      ...controller.inspirationProfile!.cmf,
      colors: [
        { name: '暖白色', ratio: 0.72 },
        { name: '黑色', ratio: 0.2 },
      ] as unknown as string[],
    },
    aiTags: [
      { name: '黑色', category: '色彩', confidence: 0.99 },
      { name: '白色', category: '色彩', confidence: 0.9 },
    ],
  });
  const malformed = image('malformed', {
    ...controller.inspirationProfile!,
    itemId: 'malformed',
    cmf: { ...controller.inspirationProfile!.cmf, colors: ['[object Object]', '原木色', '灰色'] },
    aiTags: [],
  });

  expect(getItemAiClassificationLabels(primaryWhite, 'color')).toEqual(['白色']);
  expect(getItemAiClassificationLabels(malformed, 'color')).toEqual(['木色']);
  const groups = buildAiClassificationGroups([primaryWhite, malformed, image('missing')], 'color');
  expect(groups.reduce((total, group) => total + group.count, 0)).toBe(3);
  expect(groups.some(group => group.label.includes('object'))).toBe(false);
});
