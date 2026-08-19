import { BufferItem, FloatingNoteScheduleItem, FloatingNoteSnapshot } from '../types';

type SchedulePriority = NonNullable<FloatingNoteScheduleItem['priority']>;
const SCHEDULE_PRIORITY_OPTIONS: SchedulePriority[] = ['S', 'A', 'B', 'C'];
const SCHEDULE_PRIORITY_RANK: Record<SchedulePriority, number> = { S: 0, A: 1, B: 2, C: 3 };

const normalizeSchedulePriority = (value?: string): SchedulePriority => (
  SCHEDULE_PRIORITY_OPTIONS.includes(value as SchedulePriority) ? value as SchedulePriority : 'B'
);

const formatCalendarPreviewTitle = (value: string) => {
  const chars = Array.from((value || '').replace(/\s+/g, '').trim());
  return chars.slice(0, 10).join('');
};

const lunarDayLabels = [
  '', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

const lunarDateFormatter = (() => {
  try {
    return new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' });
  } catch (_) {
    return null;
  }
})();

const formatChineseLunarDay = (time: number) => {
  if (!lunarDateFormatter) return '';

  try {
    const parts = lunarDateFormatter.formatToParts(new Date(time));
    const month = parts.find(part => part.type === 'month')?.value || '';
    const dayValue = parts.find(part => part.type === 'day')?.value || '';
    const dayNumber = Number(dayValue.replace(/[^\d]/g, ''));

    if (Number.isFinite(dayNumber) && dayNumber > 0) {
      if (dayNumber === 1 && month) return month;
      return lunarDayLabels[dayNumber] || dayValue;
    }

    if (dayValue) {
      const normalizedDay = dayValue.replace(/日$/, '');
      if ((normalizedDay === '初一' || normalizedDay === '一') && month) return month;
      return normalizedDay;
    }

    return lunarDateFormatter
      .format(new Date(time))
      .replace(/^.*?年/, '')
      .replace(/日$/, '');
  } catch (_) {
    return '';
  }
};

const parseChineseLunarParts = (time: number) => {
  if (!lunarDateFormatter) return null;

  try {
    const parts = lunarDateFormatter.formatToParts(new Date(time));
    const monthValue = (parts.find(part => part.type === 'month')?.value || '').replace(/^闰/, '');
    const dayValue = (parts.find(part => part.type === 'day')?.value || '').replace(/日$/, '');
    const monthMap: Record<string, number> = {
      正月: 1, 一月: 1, 二月: 2, 三月: 3, 四月: 4, 五月: 5, 六月: 6,
      七月: 7, 八月: 8, 九月: 9, 十月: 10, 冬月: 11, 十一月: 11, 腊月: 12, 十二月: 12,
    };
    const month = monthMap[monthValue] || Number(monthValue.replace(/[^\d]/g, ''));
    const day = Number(dayValue.replace(/[^\d]/g, '')) || lunarDayLabels.indexOf(dayValue);

    if (!Number.isFinite(month) || !Number.isFinite(day) || month <= 0 || day <= 0) return null;
    return { month, day };
  } catch (_) {
    return null;
  }
};

const getCalendarDateKey = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getCalendarMonthDayKey = (time: number) => {
  const date = new Date(time);
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const makeCalendarDateRange = (start: string, end: string) => {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const current = new Date(startYear, startMonth - 1, startDay);
  const last = new Date(endYear, endMonth - 1, endDay);
  const keys: string[] = [];

  while (current.getTime() <= last.getTime()) {
    keys.push(getCalendarDateKey(current.getTime()));
    current.setDate(current.getDate() + 1);
  }

  return keys;
};

const CALENDAR_SOLAR_FESTIVALS: Record<string, string> = {
  '01-01': '元旦',
  '03-08': '妇女节',
  '03-12': '植树节',
  '05-01': '劳动节',
  '05-04': '青年节',
  '06-01': '儿童节',
  '06-26': '国际禁毒日',
  '07-01': '建党节',
  '07-07': '七七事变',
  '08-01': '建军节',
  '09-10': '教师节',
  '10-01': '国庆节',
};

const CALENDAR_LUNAR_FESTIVALS: Record<string, string> = {
  '1-1': '春节',
  '1-15': '元宵节',
  '5-5': '端午节',
  '7-7': '七夕',
  '8-15': '中秋节',
  '9-9': '重阳节',
  '12-8': '腊八节',
};

const CALENDAR_2026_SOLAR_TERMS: Record<string, string> = {
  '2026-01-05': '小寒',
  '2026-01-20': '大寒',
  '2026-02-04': '立春',
  '2026-02-18': '雨水',
  '2026-03-05': '惊蛰',
  '2026-03-20': '春分',
  '2026-04-05': '清明',
  '2026-04-20': '谷雨',
  '2026-05-05': '立夏',
  '2026-05-21': '小满',
  '2026-06-05': '芒种',
  '2026-06-21': '夏至',
  '2026-07-07': '小暑',
  '2026-07-23': '大暑',
  '2026-08-07': '立秋',
  '2026-08-23': '处暑',
  '2026-09-07': '白露',
  '2026-09-23': '秋分',
  '2026-10-08': '寒露',
  '2026-10-23': '霜降',
  '2026-11-07': '立冬',
  '2026-11-22': '小雪',
  '2026-12-07': '大雪',
  '2026-12-22': '冬至',
};

const CHINA_2026_PUBLIC_REST_DAY_KEYS = new Set([
  ...makeCalendarDateRange('2026-01-01', '2026-01-03'),
  ...makeCalendarDateRange('2026-02-15', '2026-02-23'),
  ...makeCalendarDateRange('2026-04-04', '2026-04-06'),
  ...makeCalendarDateRange('2026-05-01', '2026-05-05'),
  ...makeCalendarDateRange('2026-06-19', '2026-06-21'),
  ...makeCalendarDateRange('2026-09-25', '2026-09-27'),
  ...makeCalendarDateRange('2026-10-01', '2026-10-07'),
]);

const getCalendarWeekdayFestival = (time: number) => {
  const date = new Date(time);
  const month = date.getMonth() + 1;
  const weekOfMonth = Math.floor((date.getDate() - 1) / 7) + 1;

  if (date.getDay() === 0 && month === 5 && weekOfMonth === 2) return '母亲节';
  if (date.getDay() === 0 && month === 6 && weekOfMonth === 3) return '父亲节';
  return '';
};

const getCalendarDayMeta = (time: number) => {
  const dateKey = getCalendarDateKey(time);
  const lunarParts = parseChineseLunarParts(time);
  const lunarFestival = lunarParts ? CALENDAR_LUNAR_FESTIVALS[`${lunarParts.month}-${lunarParts.day}`] : '';
  const label = (
    CALENDAR_SOLAR_FESTIVALS[getCalendarMonthDayKey(time)] ||
    getCalendarWeekdayFestival(time) ||
    lunarFestival ||
    CALENDAR_2026_SOLAR_TERMS[dateKey] ||
    formatChineseLunarDay(time)
  );

  return {
    label,
    isNamedDay: label !== formatChineseLunarDay(time),
    isPublicRestDay: CHINA_2026_PUBLIC_REST_DAY_KEYS.has(dateKey),
  };
};

const getCalendarMiniEventClass = (event?: CalendarScheduleEvent) => {
  if (!event) return '';
  if (event.schedule.done) {
    return 'border-stone-200/70 bg-stone-100/70 text-stone-400 line-through dark:border-stone-700/60 dark:bg-stone-800/44 dark:text-stone-500';
  }

  switch (normalizeSchedulePriority(event.schedule.priority)) {
    case 'S':
      return 'border-rose-100/80 bg-rose-100/76 text-rose-700/82 dark:border-rose-800/38 dark:bg-rose-900/28 dark:text-rose-200/82';
    case 'A':
      return 'border-amber-100/80 bg-amber-100/78 text-amber-700/82 dark:border-amber-800/38 dark:bg-amber-900/28 dark:text-amber-200/82';
    case 'B':
      return 'border-sky-100/80 bg-sky-100/78 text-sky-700/82 dark:border-sky-800/38 dark:bg-sky-900/28 dark:text-sky-200/82';
    case 'C':
    default:
      return 'border-stone-200/76 bg-stone-100/70 text-stone-500/86 dark:border-stone-700/60 dark:bg-stone-800/44 dark:text-stone-300/82';
  }
};

const extractScheduleLinesFromText = (content?: string) => (
  (content || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*+\u2022]|\d+[\).\u3001])\s*/, '').trim())
    .filter(Boolean)
);

const buildScheduleItemsFromText = (
  content: string,
  existingItems: FloatingNoteScheduleItem[] = [],
  options: {
    tagIds?: string[];
    sourceItemId?: string;
    defaultPriority?: SchedulePriority;
  } = {},
) => {
  const lines = extractScheduleLinesFromText(content);
  const now = Date.now();
  const used = new Set<string>();
  const byText = new Map<string, FloatingNoteScheduleItem[]>();

  existingItems.forEach(item => {
    const key = item.text.trim();
    if (!key) return;
    const list = byText.get(key) || [];
    list.push(item);
    byText.set(key, list);
  });

  return lines.map((line, index) => {
    const sameTextMatch = (byText.get(line) || []).find(item => !used.has(item.id));
    const indexMatch = existingItems[index] && !used.has(existingItems[index].id) ? existingItems[index] : undefined;
    const previous = sameTextMatch || indexMatch;
    if (previous) used.add(previous.id);

    const tagIds = Array.isArray(previous?.tagIds)
      ? previous.tagIds
      : (options.tagIds || []);

    return {
      id: previous?.id || `schedule_${now}_${index}_${Math.random().toString(36).slice(2, 6)}`,
      text: line,
      done: previous?.done ?? false,
      priority: normalizeSchedulePriority(previous?.priority || options.defaultPriority),
      startAt: previous?.startAt,
      endAt: previous?.endAt,
      allDay: previous?.allDay ?? true,
      tagIds,
      sourceItemId: previous?.sourceItemId || options.sourceItemId,
      createdAt: previous?.createdAt || now + index,
      updatedAt: previous && previous.text !== line ? now : previous?.updatedAt,
    } as FloatingNoteScheduleItem;
  });
};

const getScheduleTextContent = (items?: FloatingNoteScheduleItem[]) => (
  (Array.isArray(items) ? items : [])
    .map(item => (item.text || '').trim())
    .filter(Boolean)
    .join('\n')
);

const getSchedulePriorityClass = (priority?: string) => {
  switch (normalizeSchedulePriority(priority)) {
    case 'S':
      return 'bg-red-600 text-white dark:bg-red-600 dark:text-white';
    case 'A':
      return 'bg-orange-600 text-white dark:bg-orange-600 dark:text-white';
    case 'B':
      return 'bg-blue-600 text-white dark:bg-blue-600 dark:text-white';
    case 'C':
      return 'bg-green-700 text-white dark:bg-green-700 dark:text-white';
    default:
      return 'bg-green-700 text-white dark:bg-green-700 dark:text-white';
  }
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const startOfLocalDay = (value: number | Date = Date.now()) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

const addLocalDays = (value: number, days: number) => {
  const date = new Date(startOfLocalDay(value));
  date.setDate(date.getDate() + days);
  return date.getTime();
};

const formatDateInputValue = (value?: number) => {
  if (!Number.isFinite(Number(value))) return '';
  const date = new Date(Number(value));
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const parseDateInputValue = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return new Date(year, month - 1, day).getTime();
};

const getLocalDateKey = (value?: number) => formatDateInputValue(startOfLocalDay(Number(value)));

const getTodayInputValue = () => formatDateInputValue(Date.now());

const formatScheduleDateLabel = (value?: number) => {
  if (!Number.isFinite(Number(value))) return '未安排';
  const day = startOfLocalDay(Number(value));
  const today = startOfLocalDay(Date.now());
  if (day === today) return '今天';
  if (day === addLocalDays(today, 1)) return '明天';
  if (day === addLocalDays(today, -1)) return '昨天';
  const date = new Date(day);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

type CalendarScheduleEvent = {
  id: string;
  noteLabel: string;
  note: FloatingNoteSnapshot;
  item?: BufferItem;
  schedule: FloatingNoteScheduleItem;
  title: string;
  sourceTitle: string;
  dayKey: string;
  tagIds: string[];
  isUnscheduled: boolean;
};

const compareCalendarEvents = (a: CalendarScheduleEvent, b: CalendarScheduleEvent) => (
  Number(a.schedule.done) - Number(b.schedule.done) ||
  SCHEDULE_PRIORITY_RANK[normalizeSchedulePriority(a.schedule.priority)] - SCHEDULE_PRIORITY_RANK[normalizeSchedulePriority(b.schedule.priority)] ||
  a.schedule.createdAt - b.schedule.createdAt
);

const getCalendarNotificationBody = (events: CalendarScheduleEvent[]) => {
  const lines = events
    .slice(0, 4)
    .map((event, index) => `${index + 1}. ${event.title}`);
  if (events.length > 4) lines.push(`还有 ${events.length - 4} 项`);
  return lines.join('\n');
};


export {
  SCHEDULE_PRIORITY_OPTIONS,
  SCHEDULE_PRIORITY_RANK,
  normalizeSchedulePriority,
  formatCalendarPreviewTitle,
  formatChineseLunarDay,
  getCalendarDateKey,
  getCalendarDayMeta,
  getCalendarMiniEventClass,
  extractScheduleLinesFromText,
  buildScheduleItemsFromText,
  getScheduleTextContent,
  getSchedulePriorityClass,
  startOfLocalDay,
  addLocalDays,
  formatDateInputValue,
  parseDateInputValue,
  getLocalDateKey,
  getTodayInputValue,
  formatScheduleDateLabel,
  compareCalendarEvents,
  getCalendarNotificationBody,
};

export type { SchedulePriority, CalendarScheduleEvent };
