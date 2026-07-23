import { expect, test } from 'vitest';
import type { BufferItem, Folder } from '../../../types';
import { isCanvasAgentToolReadOnly } from '../../canvasAgentTools';
import { evaluateLegacyActionPermission } from '../commands/permissionGate';
import { buildProfileOrganizationPlan } from './profileOrganizer';

const folders: Folder[] = [
  { id: 'ai', name: 'AI生图', color: '#10b981' },
  { id: 'controller', name: '游戏手柄', color: '#10b981', parentId: 'ai' },
];

const image = (
  id: string,
  profile?: BufferItem['inspirationProfile'],
  folderId = 'ai',
): BufferItem => ({
  id,
  type: 'image',
  name: id,
  content: '',
  createdAt: 1,
  folderId,
  inspirationProfile: profile,
});

test('profile organizer scans the full folder and reuses matching child folders', () => {
  const plan = buildProfileOrganizationPlan({
    items: [
      image('controller-1', {
        itemId: 'controller-1',
        summary: '紫色灯光下的游戏手柄产品渲染',
        objects: ['游戏手柄'],
        category: '游戏外设',
        form: { silhouette: ['圆润'], geometry: [], proportion: [] },
        cmf: { colors: ['紫色', '黑色'], materials: ['塑料'], finishes: ['磨砂'] },
        style: ['科技'],
        interaction: ['按键'],
        scene: ['桌面'],
        mood: ['电竞'],
        userTags: [],
        userNotes: [],
      }),
      image('missing'),
    ],
    folders,
    sourceFolderId: 'ai',
  });

  expect(plan.totalImages).toBe(2);
  expect(plan.analyzedImages).toBe(1);
  expect(plan.unanalyzedImages).toBe(1);
  expect(plan.assignments[0]).toMatchObject({
    itemId: 'controller-1',
    destinationName: '游戏手柄',
    destinationFolderId: 'controller',
    confidence: 0.96,
  });
  expect(plan.unresolvedItemIds).toEqual(['missing']);
});

test('profile organizer can use explicit categories and color as a secondary dimension', () => {
  const plan = buildProfileOrganizationPlan({
    items: [
      image('projector', {
        itemId: 'projector',
        summary: '暖白色便携投影仪',
        objects: ['便携投影仪'],
        category: '投影设备',
        form: { silhouette: [], geometry: [], proportion: [] },
        cmf: { colors: ['暖白', '棕色'], materials: [], finishes: [] },
        style: ['家居'],
        interaction: [],
        scene: [],
        mood: [],
        userTags: [],
        userNotes: [],
      }),
    ],
    folders,
    sourceFolderId: 'ai',
    strategy: 'topic_color',
    categories: ['投影仪', '游戏手柄'],
  });

  expect(plan.assignments[0].destinationName).toBe('投影仪-暖色');
  expect(plan.groups[0].count).toBe(1);
});

test('organization preview is read-only and applying a plan requires confirmation', () => {
  expect(isCanvasAgentToolReadOnly('drawer_plan_organization')).toBe(true);
  expect(evaluateLegacyActionPermission({
    tool: 'drawer_apply_organization',
    arguments: { planId: 'plan-1' },
  }).requiresConfirmation).toBe(true);
});
