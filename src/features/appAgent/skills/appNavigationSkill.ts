import type { AppAgentSkill } from './types';
import { matchKeywords } from './skillUtils';

const NAVIGATION_KEYWORDS = [
  '打开抽屉',
  '关闭抽屉',
  '进入画布',
  '退出画布',
  '打开设置',
  '打开便签',
  '打开日历',
  '搜索',
  '切换',
  '最小化',
  '最大化',
  '置顶',
  'open drawer',
  'close drawer',
  'calendar',
  'settings',
] as const;

export const appNavigationSkill: AppAgentSkill = {
  id: 'app-navigation-skill',
  label: 'App Navigation',
  description: '界面导航、搜索、窗口和全局入口控制。',
  match: input => matchKeywords(input.userText, NAVIGATION_KEYWORDS),
  getRequiredContext: () => ['minimal'],
  buildPromptPatch: () => [
    'Active skill: app-navigation-skill.',
    'Use app_navigate for drawer, canvas, settings, notes, calendar, search, tab switching, window minimize/maximize, pin and undo actions.',
    'Do not use app_ui_interact unless semantic tools cannot cover the visible control.',
  ].join('\n'),
};
