import type { AppAgentSkill, ContextScope } from './types';
import { matchKeywords } from './skillUtils';

const CALENDAR_KEYWORDS = [
  '日历',
  '日程',
  '计划',
  '今天',
  '明天',
  '后天',
  '提醒',
  '安排',
  '完成',
  '待办',
  'calendar',
  'schedule',
] as const;

export const calendarControlSkill: AppAgentSkill = {
  id: 'calendar-control-skill',
  label: 'Calendar Control',
  description: '日历、日程、提醒和待办状态管理。',
  match: input => matchKeywords(input.userText, CALENDAR_KEYWORDS),
  getRequiredContext: (): ContextScope[] => ['calendar', 'drawer'],
  buildPromptPatch: () => [
    'Active skill: calendar-control-skill.',
    'Use calendar_manage for opening calendar, selecting dates, adding, updating, deleting schedules, and converting selected text notes.',
    'Delete schedule is destructive. Use scheduleId/noteLabel from calendar.events only.',
  ].join('\n'),
};
