import type { AppAgentSkill, ContextScope } from './types';
import { matchKeywords } from './skillUtils';

const DRAWER_KEYWORDS = [
  '整理素材',
  '创建文件夹',
  '新建文件夹',
  '移动到文件夹',
  '重命名',
  '删除素材',
  '删除文件夹',
  '选择这些',
  '加入画布',
  '保存灵感',
  '创建便签',
  '抽屉',
  '素材',
  'folder',
  'drawer',
] as const;

export const drawerControlSkill: AppAgentSkill = {
  id: 'drawer-control-skill',
  label: 'Drawer Control',
  description: '抽屉素材、文件夹、选择、移动、删除和便签控制。',
  match: input => matchKeywords(input.userText, DRAWER_KEYWORDS),
  getRequiredContext: (): ContextScope[] => ['drawer'],
  buildPromptPatch: () => [
    'Active skill: drawer-control-skill.',
    'Use drawer_manage for material, folder, selection, note and add-to-canvas operations.',
    'Use drawer_search_inspirations for read-only project-aware retrieval across long-term image collections.',
    'Delete folder/items are destructive and must be confirmed by the app permission gate.',
    'Use IDs from drawer.items and drawer.folders only; never invent itemId or folderId.',
  ].join('\n'),
};
